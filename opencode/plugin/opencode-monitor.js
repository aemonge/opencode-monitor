// opencode-monitor.js - OpenCode plugin for session monitoring
//
// This plugin connects to the OpenCode Monitor TUI via WebSocket
// and acts as a reverse proxy for SDK requests.
//
// Install: Copy or symlink to ~/.config/opencode/plugin/
// Configure: Set OPENCODE_MONITOR_HOST to your TUI host(s)
//
// Environment variables:
//   OPENCODE_MONITOR_HOST  - TUI host(s), comma-separated (default: 127.0.0.1)
//   OPENCODE_MONITOR_PORT  - WebSocket port (default: 41235)
//   OPENCODE_MONITOR_TOKEN - Shared token for monitor authentication (optional)
//   OPENCODE_SERVER_URL    - Full URL override for this OpenCode server (e.g., https://myserver.com:8443)
//                            Takes precedence over all other server settings
//   OPENCODE_SERVER_HOST   - IP/hostname to advertise for this server (default: auto-detect from WS connection)
//                            Set this when the TUI runs on a different machine
//   OPENCODE_SERVER_PORT   - Port override for this OpenCode server
//                            Use when behind NAT/port forwarding where external port differs from internal
//   OPENCODE_MONITOR_DEBUG - Set to "1" to enable debug logging

import { execSync } from "node:child_process";
import { basename, join } from "node:path";
import { hostname, tmpdir } from "node:os";
import { appendFileSync } from "node:fs";
import { WebSocket } from "ws";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HOSTS = (() => {
  const raw = process.env.OPENCODE_MONITOR_HOST || "127.0.0.1";
  const parsed = raw
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  if (parsed.length === 0) return ["127.0.0.1"];

  // Deduplicate while preserving order
  return [...new Set(parsed)];
})();
const PORT = parseInt(process.env.OPENCODE_MONITOR_PORT, 10) || 41235;

// Server URL override - takes precedence over all other server settings
const SERVER_URL_OVERRIDE = process.env.OPENCODE_SERVER_URL || null;

// SERVER_HOST can be:
// - Not set or "auto" → TUI will use the remote address from the WebSocket connection
// - An explicit IP → used as-is (e.g., "127.0.0.1" for local-only)
const SERVER_HOST_ENV = process.env.OPENCODE_SERVER_HOST;
const SERVER_HOST =
  !SERVER_HOST_ENV || SERVER_HOST_ENV.toLowerCase() === "auto"
    ? "AUTO"
    : SERVER_HOST_ENV;

// SERVER_PORT override - use when behind NAT/port forwarding
const SERVER_PORT_OVERRIDE = process.env.OPENCODE_SERVER_PORT
  ? parseInt(process.env.OPENCODE_SERVER_PORT, 10)
  : null;

const DEBUG = process.env.OPENCODE_MONITOR_DEBUG === "1";
const LOG_FILE =
  process.env.OPENCODE_PLUGIN_LOG_FILE || join(tmpdir(), "opencode-plugin.log");
const AUTH_TOKEN = process.env.OPENCODE_MONITOR_TOKEN;

// Reconnection settings
const RECONNECT_INITIAL_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 60000; // 60 seconds (was 10s - reduced churn when TUI is not running)
const RECONNECT_MULTIPLIER = 1.5;

function debug(...args) {
  if (DEBUG) console.error("[opencode-monitor]", ...args);
}

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  if (DEBUG) console.error(line.trim());
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Ignore file write errors
  }
}

function getGitBranch(cwd) {
  try {
    return (
      execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .trim()
        .split("\n")
        .pop() || null
    );
  } catch {
    return null;
  }
}

/**
 * Discover the OpenCode server URL via lsof
 *
 * Priority:
 * 1. OPENCODE_SERVER_URL - Full URL override (highest priority, no health check)
 * 2. OPENCODE_SERVER_PORT + OPENCODE_SERVER_HOST - Partial override (no health check)
 * 3. lsof detection + OPENCODE_SERVER_HOST - Auto-detect port (requires health check)
 *
 * Returns { url: string, needsHealthCheck: boolean }
 * url is "disabled" if no HTTP server is detected.
 */
function discoverServerUrl() {
  // 1. Full URL override takes precedence - trust the user
  if (SERVER_URL_OVERRIDE) {
    debug(`Using server URL override: ${SERVER_URL_OVERRIDE}`);
    return {
      url: SERVER_URL_OVERRIDE.replace(/\/$/, ""),
      needsHealthCheck: false,
    };
  }

  // 2. If port is overridden, use it with SERVER_HOST - trust the user
  if (SERVER_PORT_OVERRIDE) {
    const url = `http://${SERVER_HOST}:${SERVER_PORT_OVERRIDE}`;
    debug(`Using server port override: ${url}`);
    return { url, needsHealthCheck: false };
  }

  // 3. Auto-detect port via lsof - needs health check to verify
  try {
    const output = execSync(
      `lsof -iTCP -sTCP:LISTEN -a -p ${process.pid} -Fn -P 2>/dev/null`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );

    // Parse lsof output to find port (format: "n*:PORT" or "n127.0.0.1:PORT")
    const portMatch = output.match(/n[^:]*:(\d+)/);
    if (portMatch) {
      const port = portMatch[1];
      const url = `http://${SERVER_HOST}:${port}`;
      debug(`Discovered server URL via lsof: ${url}`);
      return { url, needsHealthCheck: true };
    }
  } catch {
    // lsof failed or no listening port found
  }

  // No server URL found - HTTP server is not enabled
  return { url: "disabled", needsHealthCheck: false };
}

/**
 * Check if the server URL is actually responding
 * @param {string} url - The server URL to check (may contain "AUTO")
 * @returns {Promise<boolean>} - True if server is healthy
 */
async function checkServerHealth(url) {
  // For health check, use localhost since AUTO isn't a real host
  const checkUrl = url.replace("AUTO", "127.0.0.1");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);

    const response = await fetch(`${checkUrl}/global/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.healthy === true) {
        debug(`Health check passed for ${checkUrl}`);
        return true;
      }
    }
  } catch (err) {
    debug(`Health check failed for ${checkUrl}: ${err.message}`);
  }

  return false;
}

// ---------------------------------------------------------------------------
// SDK Call Router
// ---------------------------------------------------------------------------

/**
 * Route an RPC method call to the SDK client
 */
async function routeSDKCall(client, method, params) {
  const parts = method.split(".");
  if (parts.length !== 2) {
    throw new Error(`Invalid method format: ${method}`);
  }

  const [namespace, action] = parts;
  const sdk = client[namespace];

  if (!sdk || typeof sdk[action] !== "function") {
    throw new Error(`Unknown method: ${method}`);
  }

  debug(`Routing SDK call: ${method}`, params);
  const result = await sdk[action](params);
  return result.data;
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const OpencodeMonitor = async ({ project, directory, client }) => {
  const serverId = `${hostname()}-${process.pid}`;
  const dirName = basename(directory);
  const branch = getGitBranch(directory);
  const serverName = project?.name || dirName;

  // Discover the OpenCode server URL for attach/browser functionality
  // Retry a few times since the server may not be listening immediately
  let serverUrl = "disabled";
  for (let i = 0; i < 5 && serverUrl === "disabled"; i++) {
    const { url: candidateUrl, needsHealthCheck } = discoverServerUrl();

    if (candidateUrl !== "disabled") {
      if (!needsHealthCheck) {
        // User override - trust it without health check
        serverUrl = candidateUrl;
      } else {
        // Auto-detected - verify the server is actually responding
        const isHealthy = await checkServerHealth(candidateUrl);
        if (isHealthy) {
          serverUrl = candidateUrl;
        } else {
          debug(`Server at ${candidateUrl} not healthy yet, retrying...`);
        }
      }
    }

    if (serverUrl === "disabled" && i < 4) {
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  log(
    `Plugin started for ${serverName} (PID: ${process.pid}, URL: ${serverUrl || "unknown"})`,
  );
  debug(
    `Connecting to monitor endpoints: ${HOSTS.map(
      (host) => `ws://${host}:${PORT}`,
    ).join(", ")}`,
  );

  let shuttingDown = false;

  let connections = [];

  /**
   * Handle shutdown
   */
  function handleShutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    log("Shutting down");

    for (const connection of connections) {
      connection.shutdown();
    }
  }

  /**
   * Create and manage a connection to one monitor endpoint.
   */
  function createConnection(host) {
    const endpoint = `ws://${host}:${PORT}`;
    let ws = null;
    let reconnectDelay = RECONNECT_INITIAL_DELAY;
    let reconnectTimer = null;
    let isConnected = false;

    /**
     * Fully clean up a WebSocket instance to prevent memory leaks.
     * Removes all event listeners and terminates the underlying socket.
     */
    function cleanupWs(socket) {
      if (!socket) return;
      try {
        socket.removeAllListeners();
        socket.terminate();
      } catch {
        // Ignore cleanup errors
      }
    }

    /**
     * Send a message on this connection.
     */
    function send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return true;
      }
      return false;
    }

    /**
     * Send hello message with server metadata.
     */
    function sendHello() {
      const hello = {
        type: "hello",
        serverId,
        serverName,
        serverUrl, // Include server URL for attach/browser functionality
        project: project?.name,
        branch,
        directory,
        authToken: AUTH_TOKEN,
      };
      if (send(hello)) {
        log(
          `Sent hello to ${endpoint}: ${serverName} @ ${serverUrl || "unknown"}`,
        );
      }
    }

    /**
     * Send goodbye message.
     */
    function sendGoodbye() {
      if (send({ type: "goodbye" })) {
        log(`Sent goodbye to ${endpoint}`);
      }
    }

    /**
     * Handle incoming RPC request from this endpoint.
     */
    async function handleRPCRequest(msg) {
      const { id, method, params } = msg;
      debug(`RPC request from ${endpoint} ${id}: ${method}`);

      try {
        const result = await routeSDKCall(client, method, params);
        send({ id, result });
        debug(`RPC response to ${endpoint} ${id}: success`);
      } catch (err) {
        send({ id, error: { code: -1, message: err.message } });
        debug(`RPC response to ${endpoint} ${id}: error - ${err.message}`);
      }
    }

    /**
     * Connect to one monitor endpoint.
     */
    function connect() {
      if (shuttingDown) return;

      debug(`Connecting to ${endpoint}`);

      try {
        ws = new WebSocket(endpoint);
      } catch (err) {
        log(`Failed to create WebSocket for ${endpoint}: ${err.message}`);
        scheduleReconnect();
        return;
      }

      ws.on("open", () => {
        isConnected = true;
        log(`Connected to TUI at ${endpoint}`);
        reconnectDelay = RECONNECT_INITIAL_DELAY; // Reset on successful connect
        sendHello();
      });

      ws.on("message", async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Check if it's an RPC request (has id and method)
          if (typeof msg.id === "number" && typeof msg.method === "string") {
            await handleRPCRequest(msg);
          }
        } catch (err) {
          debug(`Failed to handle message from ${endpoint}: ${err.message}`);
        }
      });

      ws.on("close", () => {
        // Only log an actual connected -> disconnected transition.
        // Failed reconnect attempts while already disconnected stay debug-only.
        const wasConnected = isConnected;
        isConnected = false;
        if (wasConnected) {
          log(`Disconnected from TUI at ${endpoint}`);
        }

        // Clean up the old WebSocket to prevent memory leaks
        const oldWs = ws;
        ws = null;
        cleanupWs(oldWs);

        if (!shuttingDown) {
          scheduleReconnect();
        }
      });

      ws.on("error", (err) => {
        debug(`WebSocket error for ${endpoint}: ${err.message}`);
        // Close event will handle reconnection and cleanup
      });
    }

    /**
     * Schedule a reconnection attempt with exponential backoff.
     */
    function scheduleReconnect() {
      if (shuttingDown || reconnectTimer) return;

      debug(`Scheduling reconnect to ${endpoint} in ${reconnectDelay}ms`);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);

      // Exponential backoff
      reconnectDelay = Math.min(
        reconnectDelay * RECONNECT_MULTIPLIER,
        RECONNECT_MAX_DELAY,
      );
    }

    /**
     * Shutdown this connection.
     */
    function shutdown() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (ws) {
        sendGoodbye();
        // Give time for goodbye to send, then force cleanup
        const socketToClose = ws;
        ws = null;
        isConnected = false;
        setTimeout(() => {
          cleanupWs(socketToClose);
        }, 100);
      }
    }

    connect();

    return {
      send,
      shutdown,
    };
  }

  connections = HOSTS.map((host) => createConnection(host));

  /**
   * Send a message to all connected monitor endpoints.
   */
  function sendAll(msg) {
    let sentCount = 0;
    for (const connection of connections) {
      if (connection.send(msg)) {
        sentCount += 1;
      }
    }
    return sentCount;
  }

  // Shutdown handling
  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
  process.on("exit", handleShutdown);

  /**
   * Full cleanup: shutdown connections and remove process listeners
   * to prevent leaked references from keeping the plugin closure alive.
   */
  function dispose() {
    handleShutdown();

    // Remove process listeners to allow full GC of the plugin closure
    process.removeListener("SIGINT", handleShutdown);
    process.removeListener("SIGTERM", handleShutdown);
    process.removeListener("exit", handleShutdown);
  }

  return {
    // Forward SDK events to TUI
    event: ({ event }) => {
      const sent = sendAll({ type: "event", event });
      if (sent > 0) {
        debug(
          `Forwarded event to ${sent}/${connections.length} monitor(s): ${event.type}`,
        );
      }
    },
    dispose,
  };
};
