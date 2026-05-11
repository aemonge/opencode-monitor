#!/usr/bin/env bun

// src/index.tsx
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { spawnSync } from "child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync as existsSync2,
  mkdirSync as mkdirSync2,
  unlinkSync
} from "fs";
import { tmpdir as tmpdir3, homedir as homedir3 } from "os";
import { join as join4, dirname } from "path";
import { fileURLToPath } from "url";

// src/app.tsx
import { useCallback, useEffect as useEffect5, useMemo as useMemo2, useRef as useRef4 } from "react";
import { TextAttributes as TextAttributes5 } from "@opentui/core";
import { useTerminalDimensions, useRenderer } from "@opentui/react";

// src/hooks/useWebSocket.ts
import { useEffect, useRef } from "react";

// src/lib/config.ts
var APP_NAME = "oc-mon";
var CONFIG = {
  /** WebSocket server settings */
  ws: {
    /** Default WebSocket server port */
    port: 41235,
    /** RPC request timeout in milliseconds */
    rpcTimeout: 3e4,
    /** Maximum concurrent RPC requests per server */
    maxConcurrentRequests: 10
  },
  /** Polling intervals */
  polling: {
    /** Fast polling interval for status updates (milliseconds) */
    statusInterval: 5e3,
    /** Slow polling interval for full details (milliseconds) */
    detailsInterval: 1e4,
    /** Initial details fetch delay (milliseconds) */
    initialDetailsDelay: 1e3
  },
  /** Debounce timings */
  debounce: {
    /** Grace period before removing disconnected server (milliseconds) */
    disconnect: 1500,
    /** Minimum time between session fetches (milliseconds) */
    sessionFetch: 2e3
  },
  /** Cache settings */
  cache: {
    /** Cache time-to-live (milliseconds) */
    ttl: 6e4
  },
  /** Process lifecycle */
  lifecycle: {
    /** Exit code that signals controller to relaunch TUI */
    relaunchExitCode: 42,
    /** Time to wait for pending servers to reconnect (milliseconds) */
    pendingServerTimeout: 3e4
  },
  /** Server availability check */
  availability: {
    /** Timeout for server availability check (milliseconds) */
    checkTimeout: 2e3
  },
  /** UI modal dimensions */
  modal: {
    /** Width for subagent warning modal */
    subagentWidth: 47,
    /** Height for subagent warning modal */
    subagentHeight: 13,
    /** Width for server unavailable modal */
    serverUnavailableWidth: 46,
    /** Height for server unavailable modal */
    serverUnavailableHeight: 13,
    /** Width for TUI server unavailable modal */
    tuiServerUnavailableWidth: 50,
    /** Height for TUI server unavailable modal */
    tuiServerUnavailableHeight: 14
  }
};
var ENV_VARS = {
  /** Monitor host(s) for plugin to connect to */
  monitorHost: "OPENCODE_MONITOR_HOST",
  /** WebSocket port */
  monitorPort: "OPENCODE_MONITOR_PORT",
  /** Authentication token */
  monitorToken: "OPENCODE_MONITOR_TOKEN",
  /** Debug log file path */
  logFile: "OPENCODE_MONITOR_LOG_FILE",
  /** Console log redirect path */
  consoleLog: "OPENCODE_MONITOR_CONSOLE_LOG",
  /** Session cache file path */
  cacheFile: "OPENCODE_MONITOR_CACHE_FILE",
  /** Relaunch session ID (internal) */
  relaunchSession: "OPENCODE_MONITOR_RELAUNCH_SESSION"
};

// src/lib/ws-server.ts
import { EventEmitter } from "events";
import { WebSocketServer } from "ws";

// src/lib/debug.ts
import { appendFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
var DEBUG = process.argv.includes("--debug") || process.env.OPENCODE_MONITOR_DEBUG === "1";
function getLogPath() {
  if (process.env.OPENCODE_MONITOR_LOG_FILE) {
    const path = process.env.OPENCODE_MONITOR_LOG_FILE;
    if (path.startsWith("~")) {
      return join(homedir(), path.slice(1));
    }
    return path;
  }
  return join(tmpdir(), "opencode-monitor-debug.log");
}
var LOG_PATH = getLogPath();
function debug(msg) {
  if (!DEBUG) return;
  try {
    appendFileSync(LOG_PATH, `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`);
  } catch {
  }
}

// src/lib/errors.ts
var MonitorError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "MonitorError";
  }
};
var PortInUseError = class extends MonitorError {
  constructor(port, elapsed) {
    const elapsedStr = elapsed ? ` after ${Math.round(elapsed / 1e3)}s` : "";
    super(`Port ${port} is already in use${elapsedStr}`, "PORT_IN_USE");
    this.port = port;
    this.elapsed = elapsed;
    this.name = "PortInUseError";
  }
};
var RpcTimeoutError = class extends MonitorError {
  constructor(method, timeoutMs) {
    super(`RPC timeout: ${method} (${timeoutMs}ms)`, "RPC_TIMEOUT");
    this.method = method;
    this.timeoutMs = timeoutMs;
    this.name = "RpcTimeoutError";
  }
};
var NoClientError = class extends MonitorError {
  constructor(serverId) {
    super(`No client connected for server: ${serverId}`, "NO_CLIENT");
    this.serverId = serverId;
    this.name = "NoClientError";
  }
};
var ShutdownError = class extends MonitorError {
  constructor(message = "Server shutting down") {
    super(message, "SHUTDOWN");
    this.name = "ShutdownError";
  }
};
function isPortInUseError(error) {
  if (error instanceof PortInUseError) return true;
  if (error instanceof Error) {
    return error.message.includes("EADDRINUSE") || error.message.includes("in use");
  }
  return false;
}
function extractErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// src/lib/ws-types.ts
function isRPCResponse(msg) {
  return typeof msg === "object" && msg !== null && "id" in msg && typeof msg.id === "number";
}
function isPluginMessage(msg) {
  return typeof msg === "object" && msg !== null && "type" in msg && typeof msg.type === "string";
}
function isHelloMessage(msg) {
  return msg.type === "hello";
}
function isEventMessage(msg) {
  return msg.type === "event";
}
function isGoodbyeMessage(msg) {
  return msg.type === "goodbye";
}
function isSessionStatusEvent(event) {
  return event.type === "session.status" && typeof event.properties === "object" && event.properties !== null && "sessionID" in event.properties && "status" in event.properties;
}
function isPermissionUpdatedEvent(event) {
  return event.type === "permission.updated" && typeof event.properties === "object" && event.properties !== null && "sessionID" in event.properties;
}

// src/lib/ws-server.ts
var serverInstanceCounter = 0;
var MonitorWSServer = class extends EventEmitter {
  wss = null;
  clients = /* @__PURE__ */ new Map();
  pendingRequests = /* @__PURE__ */ new Map();
  nextRequestId = 1;
  port;
  authToken;
  instanceId;
  activeRequestsPerServer = /* @__PURE__ */ new Map();
  requestQueues = /* @__PURE__ */ new Map();
  constructor(port = CONFIG.ws.port, authToken) {
    super();
    this.instanceId = ++serverInstanceCounter;
    debug(`[WS] MonitorWSServer instance #${this.instanceId} created`);
    this.setMaxListeners(20);
    this.port = port;
    this.authToken = authToken ?? process.env[ENV_VARS.monitorToken];
  }
  async start(retryTimeout = 1e4) {
    if (this.wss) {
      debug("[WS] Server already running");
      return;
    }
    const startTime = Date.now();
    const retryDelay = 100;
    while (Date.now() - startTime < retryTimeout) {
      try {
        await this.tryBindPort();
        debug(`[WS] Server #${this.instanceId} listening on port ${this.port}`);
        break;
      } catch (err) {
        if (!isPortInUseError(err)) {
          throw err;
        }
        const elapsed = Date.now() - startTime;
        if (elapsed + retryDelay >= retryTimeout) {
          throw new PortInUseError(this.port, elapsed);
        }
        debug(
          `[WS] Port ${this.port} in use, retrying... (${Math.round(elapsed / 1e3)}s elapsed)`
        );
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
    const wss = this.wss;
    this.setupConnectionHandler(wss);
    wss.on("error", (err) => {
      debug(`[WS] Server error: ${err.message}`);
      this.emit("error", err);
    });
  }
  tryBindPort() {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port: this.port });
      const onListening = () => {
        wss.removeListener("error", onError);
        this.wss = wss;
        resolve();
      };
      const onError = (err) => {
        wss.removeListener("listening", onListening);
        wss.close();
        reject(err);
      };
      wss.once("listening", onListening);
      wss.once("error", onError);
    });
  }
  setupConnectionHandler(wss) {
    wss.on("connection", (ws, request) => {
      let remoteAddress = request.socket.remoteAddress || "unknown";
      if (remoteAddress.startsWith("::ffff:")) {
        remoteAddress = remoteAddress.slice(7);
      }
      debug(`[WS] New connection from ${remoteAddress}`);
      let serverId = null;
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (isRPCResponse(msg)) {
            this.handleRPCResponse(msg);
            return;
          }
          if (isPluginMessage(msg)) {
            if (isHelloMessage(msg)) {
              if (this.authToken && msg.authToken !== this.authToken) {
                debug("[WS] Auth failed: invalid token");
                ws.close(1008, "Unauthorized");
                return;
              }
              serverId = msg.serverId;
              let serverUrl = msg.serverUrl;
              if (serverUrl === "disabled") {
                debug(`[WS] HTTP server disabled for this client`);
              } else if (serverUrl?.includes("AUTO")) {
                serverUrl = serverUrl.replace("AUTO", remoteAddress);
                debug(`[WS] Replaced AUTO with remote address: ${serverUrl}`);
              }
              const metadata = {
                serverId: msg.serverId,
                serverName: msg.serverName,
                serverUrl,
                project: msg.project,
                branch: msg.branch,
                directory: msg.directory
              };
              this.clients.set(serverId, { ws, metadata });
              debug(`[WS] Client registered: ${serverId} (${msg.serverName})`);
              this.emit("client_connected", serverId, metadata);
            } else if (isEventMessage(msg)) {
              if (serverId) {
                debug(`[WS] Event from ${serverId}: ${msg.event.type}`);
                this.emit("event", serverId, msg.event);
              }
            } else if (isGoodbyeMessage(msg)) {
              debug(`[WS] Goodbye from ${serverId}`);
            }
          }
        } catch (err) {
          debug(`[WS] Failed to parse message: ${extractErrorMessage(err)}`);
        }
      });
      ws.on("close", () => {
        if (serverId && this.clients.has(serverId)) {
          debug(`[WS] Client disconnected: ${serverId}`);
          this.rejectPendingRequestsForServer(serverId, "Client disconnected");
          this.clients.delete(serverId);
          this.emit("client_disconnected", serverId);
        }
      });
      ws.on("error", (err) => {
        debug(`[WS] Client error: ${err.message}`);
        this.emit("error", err);
      });
    });
  }
  stop() {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      debug(
        `[WS] Server #${this.instanceId} stopping - closing ${this.clients.size} client(s)`
      );
      this.pendingRequests.forEach((pending) => {
        clearTimeout(pending.timer);
        pending.reject(new ShutdownError());
      });
      this.pendingRequests.clear();
      this.clients.forEach((client) => {
        client.ws.close();
      });
      this.clients.clear();
      const wss = this.wss;
      this.wss = null;
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          debug("[WS] Server stopped (timeout fallback)");
          resolve();
        }
      }, 100);
      wss.close(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          debug("[WS] Server stopped");
          resolve();
        }
      });
    });
  }
  async request(serverId, method, params) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new NoClientError(serverId);
    }
    const active = this.activeRequestsPerServer.get(serverId) || 0;
    if (active >= CONFIG.ws.maxConcurrentRequests) {
      debug(
        `[WS] Queueing request ${method} for ${serverId} (${active} active)`
      );
      return new Promise((resolve, reject) => {
        const queue = this.requestQueues.get(serverId) || [];
        queue.push({ method, params, resolve, reject });
        this.requestQueues.set(serverId, queue);
      });
    }
    return this.executeRequest(serverId, method, params);
  }
  async executeRequest(serverId, method, params) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new NoClientError(serverId);
    }
    const active = this.activeRequestsPerServer.get(serverId) || 0;
    this.activeRequestsPerServer.set(serverId, active + 1);
    const id = this.nextRequestId++;
    const request = { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.decrementActiveAndProcessQueue(serverId);
        reject(new RpcTimeoutError(method, CONFIG.ws.rpcTimeout));
      }, CONFIG.ws.rpcTimeout);
      this.pendingRequests.set(id, { serverId, resolve, reject, timer });
      try {
        client.ws.send(JSON.stringify(request));
        debug(`[WS] RPC request ${id}: ${method}`);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        this.decrementActiveAndProcessQueue(serverId);
        reject(
          err instanceof Error ? err : new Error(extractErrorMessage(err))
        );
      }
    });
  }
  decrementActiveAndProcessQueue(serverId) {
    const active = this.activeRequestsPerServer.get(serverId) || 1;
    this.activeRequestsPerServer.set(serverId, Math.max(0, active - 1));
    const queue = this.requestQueues.get(serverId);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      debug(`[WS] Processing queued request ${next.method} for ${serverId}`);
      this.executeRequest(serverId, next.method, next.params).then(next.resolve).catch(next.reject);
    }
  }
  getConnectedServers() {
    return Array.from(this.clients.keys());
  }
  getServerMetadata(serverId) {
    return this.clients.get(serverId)?.metadata;
  }
  isConnected(serverId) {
    return this.clients.has(serverId);
  }
  rejectPendingRequestsForServer(serverId, reason) {
    for (const [id, pending] of this.pendingRequests) {
      if (pending.serverId === serverId) {
        clearTimeout(pending.timer);
        pending.reject(new Error(reason));
        this.pendingRequests.delete(id);
      }
    }
    const queue = this.requestQueues.get(serverId);
    if (queue) {
      for (const queued of queue) {
        queued.reject(new Error(reason));
      }
      this.requestQueues.delete(serverId);
    }
    this.activeRequestsPerServer.delete(serverId);
  }
  handleRPCResponse(response) {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      debug(`[WS] Received response for unknown request: ${response.id}`);
      return;
    }
    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);
    this.decrementActiveAndProcessQueue(pending.serverId);
    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
    debug(
      `[WS] RPC response ${response.id}: ${response.error ? "error" : "success"}`
    );
  }
};

// src/lib/ws-sdk.ts
function createWSClient(server, serverId) {
  const request = (method, params) => server.request(serverId, method, params);
  return {
    session: {
      list: () => request("session.list"),
      get: (params) => request("session.get", params),
      status: () => request("session.status"),
      abort: (params) => request("session.abort", params),
      messages: (params) => request("session.messages", params),
      children: (params) => request("session.children", params)
    },
    provider: {
      list: () => request("provider.list")
    }
  };
}

// src/lib/status.ts
function mapStatusType(statusType) {
  switch (statusType) {
    case "busy":
      return "busy";
    case "retry":
      return "retry";
    case "waiting_for_permission":
      return "waiting_for_permission";
    case "completed":
      return "completed";
    case "error":
      return "error";
    case "aborted":
      return "aborted";
    default:
      return "idle";
  }
}

// src/lib/keys.ts
function makeKey(serverId, sessionId) {
  return `${serverId}:${sessionId}`;
}
function parseKey(key) {
  const idx = key.indexOf(":");
  if (idx === -1) return { serverId: "unknown", sessionId: key };
  return {
    serverId: key.slice(0, idx),
    sessionId: key.slice(idx + 1)
  };
}
function getSessionId(key) {
  return parseKey(key).sessionId;
}

// src/lib/sdk-types.ts
function isSDKSession(value) {
  if (typeof value !== "object" || value === null) return false;
  const obj = value;
  return typeof obj.id === "string";
}
function isSDKMessage(value) {
  if (typeof value !== "object" || value === null) return false;
  return true;
}
function isSDKProvider(value) {
  if (typeof value !== "object" || value === null) return false;
  const obj = value;
  return typeof obj.id === "string";
}
function extractProviders(result) {
  if (Array.isArray(result)) {
    return result.filter(isSDKProvider);
  }
  if (typeof result === "object" && result !== null) {
    const obj = result;
    if (Array.isArray(obj.all)) {
      return obj.all.filter(isSDKProvider);
    }
  }
  return [];
}
function extractSessions(result) {
  if (!Array.isArray(result)) return [];
  return result.filter(isSDKSession);
}
function extractMessages(result) {
  if (!Array.isArray(result)) return [];
  return result.filter(isSDKMessage);
}
function extractStatusMap(result) {
  if (typeof result !== "object" || result === null) return {};
  return result;
}
function getMessageRole(msg) {
  return msg.role ?? msg.info?.role;
}
function getMessageCost(msg) {
  return msg.cost ?? msg.info?.cost;
}
function getMessageTokens(msg) {
  return msg.tokens ?? msg.info?.tokens;
}
function getMessageProviderID(msg) {
  return msg.providerID ?? msg.info?.providerID;
}
function getMessageModelID(msg) {
  return msg.modelID ?? msg.info?.modelID;
}

// src/lib/http.ts
var PROVIDER_CACHE_TTL_MS = 5 * 60 * 1e3;
var providerCache = /* @__PURE__ */ new Map();
async function getCachedProviders(client, serverId) {
  const cached = providerCache.get(serverId);
  const now = Date.now();
  if (cached && now - cached.timestamp < PROVIDER_CACHE_TTL_MS) {
    return cached.providers;
  }
  try {
    const providerResult = await client.provider.list();
    const providers = extractProviders(providerResult);
    providerCache.set(serverId, { providers, timestamp: now });
    debug(`[WS] Provider cache refreshed for ${serverId}`);
    return providers;
  } catch {
    return cached?.providers || [];
  }
}
function clearProviderCache(serverId) {
  providerCache.delete(serverId);
}
async function fetchSessionsWS(client, serverId) {
  try {
    const [listResult, statusResult] = await Promise.all([
      client.session.list(),
      client.session.status()
    ]);
    const sessions = extractSessions(listResult);
    const statuses = extractStatusMap(statusResult);
    return sessions.map((session) => {
      const sessionId = session.id;
      const status = statuses[sessionId];
      const statusType = status?.type ?? "idle";
      const sessionStatus = mapStatusType(statusType);
      const result = {
        id: makeKey(serverId, sessionId),
        originalId: sessionId,
        serverId,
        name: session.title || `Session ${sessionId.slice(0, 8)}`,
        status: sessionStatus,
        statusUpdatedAt: Date.now(),
        createdAt: session.time?.created || Date.now(),
        lastActivity: session.time?.updated || Date.now()
      };
      if (session.tokens !== void 0) result.tokens = session.tokens;
      if (session.projectID) result.project = session.projectID;
      if (session.directory) result.directory = session.directory;
      if (session.parentID) result.parentId = session.parentID;
      return result;
    });
  } catch (err) {
    debug(`[WS] Error fetching sessions: ${extractErrorMessage(err)}`);
    return [];
  }
}
function findLastAssistantWithTokens(messages) {
  return [...messages].reverse().find((msg) => {
    const role = getMessageRole(msg);
    const tokens = getMessageTokens(msg);
    return role === "assistant" && tokens?.output;
  });
}
function extractTokenBreakdown(msg) {
  const tokens = getMessageTokens(msg);
  if (!tokens) return void 0;
  return {
    input: tokens.input ?? 0,
    output: tokens.output ?? 0,
    reasoning: tokens.reasoning ?? 0,
    cacheRead: tokens.cache?.read ?? 0,
    cacheWrite: tokens.cache?.write ?? 0
  };
}
function calculateContextUsed(breakdown) {
  return breakdown.input + breakdown.output + breakdown.reasoning + breakdown.cacheRead + breakdown.cacheWrite;
}
function findContextLimit(providers, providerID, modelID) {
  const provider = providers.find((p) => p.id === providerID);
  const modelInfo = provider?.models?.[modelID];
  return modelInfo?.limit?.context;
}
function calculateTotalCost(messages) {
  const total = messages.filter((msg) => {
    const role = getMessageRole(msg);
    const cost = getMessageCost(msg);
    return role === "assistant" && typeof cost === "number";
  }).reduce((sum, msg) => sum + (getMessageCost(msg) ?? 0), 0);
  return total > 0 ? total : void 0;
}
function countMessages(messages) {
  return messages.filter((msg) => {
    const role = getMessageRole(msg);
    return role === "user" || role === "assistant";
  }).length;
}
async function fetchSessionDetailsWS(client, serverId, sessionId) {
  try {
    const [sessionResult, messagesResult, statusResult, providers] = await Promise.all([
      client.session.get({ path: { id: sessionId } }),
      client.session.messages({ path: { id: sessionId } }).catch((err) => {
        debug(`[WS] messages() failed: ${err.message}`);
        return [];
      }),
      client.session.status().catch(() => ({})),
      getCachedProviders(client, serverId)
    ]);
    const statuses = extractStatusMap(statusResult);
    const statusType = statuses[sessionId]?.type ?? "idle";
    const sessionStatus = mapStatusType(statusType);
    const s = sessionResult;
    if (!s?.id) {
      debug(`[WS] Invalid session result for ${sessionId}`);
      return null;
    }
    const messages = extractMessages(messagesResult);
    const lastAssistant = findLastAssistantWithTokens(messages);
    const tokenBreakdown = lastAssistant ? extractTokenBreakdown(lastAssistant) : void 0;
    const contextUsed = tokenBreakdown ? calculateContextUsed(tokenBreakdown) : void 0;
    let model;
    let contextLimit;
    if (lastAssistant) {
      const providerID = getMessageProviderID(lastAssistant);
      const modelID = getMessageModelID(lastAssistant);
      if (providerID && modelID) {
        model = { provider: providerID, model: modelID };
        contextLimit = findContextLimit(providers, providerID, modelID);
      }
    }
    const cost = calculateTotalCost(messages);
    const messageCount = countMessages(messages);
    const result = {
      id: makeKey(serverId, s.id),
      originalId: s.id,
      serverId,
      name: s.title || `Session ${s.id.slice(0, 8)}`,
      status: sessionStatus,
      statusUpdatedAt: Date.now(),
      createdAt: s.time?.created || Date.now(),
      lastActivity: s.time?.updated || Date.now()
    };
    if (s.tokens !== void 0) result.tokens = s.tokens;
    if (contextUsed !== void 0) result.contextUsed = contextUsed;
    if (contextLimit !== void 0) result.contextLimit = contextLimit;
    if (tokenBreakdown) result.tokenBreakdown = tokenBreakdown;
    if (cost !== void 0) result.cost = cost;
    if (messageCount > 0) result.messageCount = messageCount;
    if (model) result.model = model;
    if (s.projectID) result.project = s.projectID;
    if (s.branch) result.branch = s.branch;
    if (s.directory) result.directory = s.directory;
    if (s.parentID) result.parentId = s.parentID;
    return result;
  } catch (err) {
    debug(`[WS] fetchSessionDetailsWS error: ${extractErrorMessage(err)}`);
    return null;
  }
}

// src/lib/tree.ts
function buildChildrenMap(sessions) {
  const childrenMap = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    if (session.parentId) {
      const children = childrenMap.get(session.parentId) || [];
      children.push(session);
      childrenMap.set(session.parentId, children);
    }
  }
  return childrenMap;
}
function buildSessionNodes(sessions) {
  if (sessions.length === 0) return [];
  const sessionByOriginal = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    sessionByOriginal.set(session.originalId, session);
  }
  const childrenMap = buildChildrenMap(sessions);
  const roots = sessions.filter(
    (s) => !s.parentId || !sessionByOriginal.has(s.parentId)
  );
  const nodes = [];
  function addNode(session, depth, prefixStack, isLast) {
    let treePrefix = "";
    if (depth > 0) {
      treePrefix = prefixStack.join("");
      treePrefix += isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    }
    nodes.push({
      session,
      depth,
      isLastChild: isLast,
      treePrefix
    });
    const children = childrenMap.get(session.originalId) || [];
    children.sort((a, b) => a.createdAt - b.createdAt);
    const childPrefixStack = [...prefixStack];
    if (depth > 0) {
      childPrefixStack.push(isLast ? "    " : "\u2502   ");
    }
    children.forEach((child, index) => {
      const isLastChild = index === children.length - 1;
      addNode(child, depth + 1, childPrefixStack, isLastChild);
    });
  }
  roots.sort((a, b) => b.lastActivity - a.lastActivity);
  roots.forEach((root, index) => {
    const isLastRoot = index === roots.length - 1;
    addNode(root, 0, [], isLastRoot);
  });
  return nodes;
}
function calculateChildCounts(sessions) {
  const childCounts = /* @__PURE__ */ new Map();
  const sessionArray = sessions instanceof Map ? Array.from(sessions.values()) : sessions;
  for (const session of sessionArray) {
    if (!session.parentId) continue;
    const key = `${session.serverId}:${session.parentId}`;
    childCounts.set(key, (childCounts.get(key) ?? 0) + 1);
  }
  return childCounts;
}

// src/lib/session-filter.ts
function findCurrentSession(sessions) {
  if (sessions.length === 0) return void 0;
  const activeSession = sessions.find(
    (s) => s.status === "busy" || s.status === "waiting_for_permission"
  );
  if (activeSession) return activeSession;
  const rootSessions = sessions.filter((s) => !s.parentId);
  if (rootSessions.length > 0) {
    return rootSessions.reduce(
      (latest, s) => s.lastActivity > latest.lastActivity ? s : latest
    );
  }
  return sessions.reduce(
    (latest, s) => s.lastActivity > latest.lastActivity ? s : latest
  );
}
function buildSessionTree(currentSession, allSessions) {
  const sessionByOriginal = new Map(allSessions.map((s) => [s.originalId, s]));
  const childrenMap = buildChildrenMap(allSessions);
  const result = /* @__PURE__ */ new Set();
  result.add(currentSession);
  if (currentSession.parentId) {
    const parent = sessionByOriginal.get(currentSession.parentId);
    if (parent) {
      result.add(parent);
    }
  }
  const addDescendants = (session) => {
    const children = childrenMap.get(session.originalId) || [];
    for (const child of children) {
      if (!result.has(child)) {
        result.add(child);
        addDescendants(child);
      }
    }
  };
  addDescendants(currentSession);
  if (currentSession.parentId) {
    const siblings = childrenMap.get(currentSession.parentId) || [];
    for (const sibling of siblings) {
      if (!result.has(sibling)) {
        result.add(sibling);
        addDescendants(sibling);
      }
    }
  }
  return Array.from(result);
}
function filterToCurrentSessionTree(sessions) {
  if (sessions.length === 0) return [];
  const currentSession = findCurrentSession(sessions);
  if (!currentSession) return [];
  return buildSessionTree(currentSession, sessions);
}

// src/lib/notify.ts
import notifier from "node-notifier";

// src/lib/browser.ts
import { spawn } from "child_process";
import { platform } from "os";
function encodeDirectory(directory) {
  return Buffer.from(directory).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function buildSessionUrl(serverUrl, directory, sessionId) {
  const encodedDir = encodeDirectory(directory);
  return `${serverUrl}/${encodedDir}/session/${sessionId}`;
}
function openInBrowser(url) {
  const os = platform();
  let command = "xdg-open";
  const args = [url];
  if (os === "darwin") {
    command = "open";
  } else if (os === "win32") {
    command = "explorer";
  }
  const argPreview = args.map((arg) => JSON.stringify(arg)).join(" ");
  debug(`Opening browser: ${command} ${argPreview}`);
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", (error) => {
      debug(`Failed to open browser: ${error.message}`);
    });
    child.unref();
  } catch (error) {
    debug(`Failed to open browser: ${extractErrorMessage(error)}`);
  }
}

// src/lib/notify.ts
var NOTIFICATION_CONFIGS = {
  complete: {
    title: "Session Complete",
    sound: true,
    timeout: 5
    // 5 seconds before auto-dismiss
  },
  permission: {
    title: "Permission Required",
    sound: "Basso",
    timeout: 300
    // 5 minutes max to prevent accumulation
  }
};
function notify(type, sessionName, serverName, serverUrl, sessionId, directory) {
  const config = NOTIFICATION_CONFIGS[type];
  debug(`notify[${type}]: ${sessionName} on ${serverName}`);
  const url = buildSessionUrl(serverUrl, directory, sessionId);
  debug(`  URL: ${url}`);
  notifier.notify({
    title: config.title,
    message: `${sessionName}
${serverName}`,
    sound: config.sound,
    open: url,
    // Opens browser on click
    wait: true,
    // Enable click handling
    timeout: config.timeout
  });
}
function notifySessionComplete(sessionName, serverName, serverUrl, sessionId, directory) {
  notify("complete", sessionName, serverName, serverUrl, sessionId, directory);
}
function notifyPermissionRequired(sessionName, serverName, serverUrl, sessionId, directory) {
  notify(
    "permission",
    sessionName,
    serverName,
    serverUrl,
    sessionId,
    directory
  );
}

// src/stores/sessionStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";
var useSessionStore = create()(
  devtools(
    (set) => ({
      servers: /* @__PURE__ */ new Map(),
      sessions: /* @__PURE__ */ new Map(),
      setServer: (serverId, server) => set((state) => {
        const servers = new Map(state.servers);
        servers.set(serverId, server);
        return { servers };
      }),
      removeServer: (serverId) => set((state) => {
        const servers = new Map(state.servers);
        servers.delete(serverId);
        return { servers };
      }),
      updateServerLastSeen: (serverId) => set((state) => {
        const servers = new Map(state.servers);
        const server = servers.get(serverId);
        if (server) {
          servers.set(serverId, { ...server, lastSeen: Date.now() });
        }
        return { servers };
      }),
      setSession: (sessionId, session) => set((state) => {
        const sessions = new Map(state.sessions);
        sessions.set(sessionId, session);
        return { sessions };
      }),
      updateSession: (sessionId, updates) => set((state) => {
        const sessions = new Map(state.sessions);
        const existing = sessions.get(sessionId);
        if (existing) {
          sessions.set(sessionId, { ...existing, ...updates });
        }
        return { sessions };
      }),
      removeSession: (sessionId) => set((state) => {
        const sessions = new Map(state.sessions);
        sessions.delete(sessionId);
        return { sessions };
      }),
      removeSessionsByServer: (serverId) => set((state) => {
        const sessions = new Map(state.sessions);
        for (const [id, session] of sessions) {
          if (session.serverId === serverId) {
            sessions.delete(id);
          }
        }
        return { sessions };
      }),
      setSessions: (newSessions) => set((state) => {
        const sessions = new Map(state.sessions);
        for (const session of newSessions) {
          sessions.set(session.id, session);
        }
        return { sessions };
      }),
      mergeSessions: (newSessions) => set((state) => {
        const sessions = new Map(state.sessions);
        for (const session of newSessions) {
          const existing = sessions.get(session.id);
          sessions.set(session.id, { ...existing, ...session });
        }
        return { sessions };
      }),
      reset: () => set({
        servers: /* @__PURE__ */ new Map(),
        sessions: /* @__PURE__ */ new Map()
      })
    }),
    { name: "session-store" }
  )
);

// src/stores/uiStore.ts
import { create as create2 } from "zustand";
import { devtools as devtools2 } from "zustand/middleware";
var useUIStore = create2()(
  devtools2(
    (set, get) => ({
      selectedId: null,
      scrollOffset: 0,
      browserModal: null,
      detailedSession: null,
      collapsedServers: /* @__PURE__ */ new Set(),
      pendingLaunchRequest: null,
      setSelectedId: (id) => set({ selectedId: id }),
      setScrollOffset: (offset) => set({ scrollOffset: offset }),
      setBrowserModal: (modal) => set({ browserModal: modal }),
      setDetailedSession: (session) => set({ detailedSession: session }),
      toggleServerCollapsed: (serverId) => set((state) => {
        const newCollapsed = new Set(state.collapsedServers);
        if (newCollapsed.has(serverId)) {
          newCollapsed.delete(serverId);
        } else {
          newCollapsed.add(serverId);
        }
        return { collapsedServers: newCollapsed };
      }),
      setCollapsedServers: (serverIds) => set({ collapsedServers: new Set(serverIds) }),
      toggleAllServers: (allServerIds) => set((state) => {
        const anyExpanded = allServerIds.some(
          (id) => !state.collapsedServers.has(id)
        );
        return {
          collapsedServers: anyExpanded ? new Set(allServerIds) : /* @__PURE__ */ new Set()
        };
      }),
      setPendingLaunchRequest: (request) => set({ pendingLaunchRequest: request }),
      consumePendingLaunchRequest: () => {
        const request = get().pendingLaunchRequest;
        set({ pendingLaunchRequest: null });
        return request;
      },
      reset: () => set({
        selectedId: null,
        scrollOffset: 0,
        browserModal: null,
        detailedSession: null,
        collapsedServers: /* @__PURE__ */ new Set(),
        pendingLaunchRequest: null
      })
    }),
    { name: "ui-store" }
  )
);

// src/stores/connectionStore.ts
import { create as create3 } from "zustand";
import { devtools as devtools3 } from "zustand/middleware";
var useConnectionStore = create3()(
  devtools3(
    (set) => ({
      wsServer: null,
      wsClients: /* @__PURE__ */ new Map(),
      setWsServer: (server) => set({ wsServer: server }),
      setWsClient: (serverId, client) => set((state) => {
        const wsClients = new Map(state.wsClients);
        wsClients.set(serverId, client);
        return { wsClients };
      }),
      removeWsClient: (serverId) => set((state) => {
        const wsClients = new Map(state.wsClients);
        wsClients.delete(serverId);
        return { wsClients };
      }),
      clearWsClients: () => set({ wsClients: /* @__PURE__ */ new Map() })
    }),
    { name: "connection-store" }
  )
);

// src/hooks/useWebSocket.ts
function useWebSocket({
  port,
  notificationsEnabled,
  initialServers,
  initialSessions
}) {
  const sessionFetchInFlightRef = useRef(/* @__PURE__ */ new Map());
  const lastSessionFetchTimeRef = useRef(/* @__PURE__ */ new Map());
  const pendingDisconnectTimersRef = useRef(
    /* @__PURE__ */ new Map()
  );
  useEffect(() => {
    if (initialServers) {
      for (const [id, server] of initialServers) {
        useSessionStore.getState().setServer(id, { ...server, pending: true });
      }
    }
    if (initialSessions) {
      for (const [id, session] of initialSessions) {
        useSessionStore.getState().setSession(id, session);
      }
    }
  }, []);
  useEffect(() => {
    debug(
      `[WS] useEffect running - port=${port}, notificationsEnabled=${notificationsEnabled}`
    );
    const wsServer = new MonitorWSServer(port);
    useConnectionStore.getState().setWsServer(wsServer);
    wsServer.on(
      "client_connected",
      async (serverId, metadata) => {
        debug(`[WS] Client connected: ${serverId} (${metadata.serverName})`);
        const pendingTimer = pendingDisconnectTimersRef.current.get(serverId);
        if (pendingTimer) {
          debug(
            `[WS] Cancelling pending disconnect for ${serverId} - reconnected`
          );
          clearTimeout(pendingTimer);
          pendingDisconnectTimersRef.current.delete(serverId);
        }
        const server = {
          id: serverId,
          name: metadata.serverName,
          url: metadata.serverUrl || "",
          lastSeen: Date.now()
        };
        if (metadata.project) server.project = metadata.project;
        if (metadata.branch) server.branch = metadata.branch;
        useSessionStore.getState().setServer(serverId, server);
        const wsClient = createWSClient(wsServer, serverId);
        useConnectionStore.getState().setWsClient(serverId, wsClient);
        debug(`[WS] Fetching sessions from ${metadata.serverName}`);
        const serverSessions = await fetchSessionsWS(wsClient, serverId);
        debug(
          `[WS] Fetched ${serverSessions.length} sessions from ${metadata.serverName}`
        );
        if (!useConnectionStore.getState().wsClients.has(serverId)) return;
        const visibleSessions = filterToCurrentSessionTree(serverSessions);
        const detailResults = await Promise.all(
          visibleSessions.map(
            (s) => fetchSessionDetailsWS(wsClient, serverId, s.originalId).catch(
              () => null
            )
          )
        );
        if (!useConnectionStore.getState().wsClients.has(serverId)) return;
        useSessionStore.getState().removeSessionsByServer(serverId);
        useSessionStore.getState().setSessions(serverSessions);
        for (const details of detailResults) {
          if (details) {
            useSessionStore.getState().updateSession(details.id, details);
          }
        }
      }
    );
    wsServer.on("client_disconnected", (serverId) => {
      debug(`[WS] Client disconnected: ${serverId} - starting grace period`);
      useConnectionStore.getState().removeWsClient(serverId);
      clearProviderCache(serverId);
      const existingTimer = pendingDisconnectTimersRef.current.get(serverId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const timer = setTimeout(() => {
        pendingDisconnectTimersRef.current.delete(serverId);
        if (useConnectionStore.getState().wsClients.has(serverId)) {
          debug(
            `[WS] Server ${serverId} reconnected during grace period - skipping removal`
          );
          return;
        }
        debug(`[WS] Grace period expired for ${serverId} - removing`);
        useSessionStore.getState().removeServer(serverId);
        useSessionStore.getState().removeSessionsByServer(serverId);
      }, CONFIG.debounce.disconnect);
      pendingDisconnectTimersRef.current.set(serverId, timer);
    });
    const eventHandlers = {
      "session.status": (serverId, event) => handleStatusEvent(serverId, event, notificationsEnabled),
      "permission.updated": (serverId, event) => handlePermissionEvent(serverId, event, notificationsEnabled),
      "session.created": (serverId) => handleSessionCreatedEvent(
        serverId,
        sessionFetchInFlightRef.current,
        lastSessionFetchTimeRef.current
      ),
      "session.deleted": handleSessionDeletedEvent
    };
    wsServer.on("event", (serverId, event) => {
      debug(`[WS] Event from ${serverId}: ${event.type}`);
      const handler = eventHandlers[event.type];
      if (handler) {
        handler(serverId, event);
      }
    });
    wsServer.start().catch((err) => {
      debug(`[WS] Failed to start server: ${err.message}`);
    });
    const pendingCleanupTimer = setTimeout(() => {
      const { servers, removeServer, removeSessionsByServer } = useSessionStore.getState();
      const pendingServerIds = /* @__PURE__ */ new Set();
      for (const [id, server] of servers) {
        if (server.pending) {
          pendingServerIds.add(id);
        }
      }
      if (pendingServerIds.size === 0) return;
      debug(`[WS] Removing ${pendingServerIds.size} stale cached server(s)`);
      for (const id of pendingServerIds) {
        removeServer(id);
        removeSessionsByServer(id);
      }
    }, CONFIG.lifecycle.pendingServerTimeout);
    return () => {
      debug(`[WS] useEffect cleanup running - stopping WebSocket server`);
      clearTimeout(pendingCleanupTimer);
      for (const timer of pendingDisconnectTimersRef.current.values()) {
        clearTimeout(timer);
      }
      pendingDisconnectTimersRef.current.clear();
      wsServer.removeAllListeners();
      wsServer.stop();
      useConnectionStore.getState().clearWsClients();
      useConnectionStore.getState().setWsServer(null);
    };
  }, [port, notificationsEnabled]);
}
function handleStatusEvent(serverId, event, notificationsEnabled) {
  if (!isSessionStatusEvent(event)) {
    debug(`  Invalid session.status event structure`);
    return;
  }
  const { sessionID, status } = event.properties;
  const newStatus = mapStatusType(status.type);
  const { sessions, servers } = useSessionStore.getState();
  const sessionKey = Array.from(sessions.keys()).find(
    (key) => getSessionId(key) === sessionID && sessions.get(key)?.serverId === serverId
  );
  if (!sessionKey) {
    debug(`  Session not found for status update: ${sessionID}`);
    return;
  }
  const existingSession = sessions.get(sessionKey);
  if (!existingSession || existingSession.status === newStatus) {
    return;
  }
  debug(
    `  Status transition: ${existingSession.status} -> ${newStatus} for session ${existingSession.name}`
  );
  const isCompletion = newStatus === "idle" || newStatus === "completed";
  if (notificationsEnabled && isCompletion && (existingSession.status === "busy" || existingSession.status === "retry")) {
    const server = servers.get(existingSession.serverId);
    const serverName = server?.name || "Unknown server";
    const serverUrl = server?.url && server.url !== "disabled" ? server.url : "";
    debug(`  TRIGGERING completion notification for ${existingSession.name}`);
    notifySessionComplete(
      existingSession.name,
      serverName,
      serverUrl,
      existingSession.originalId,
      existingSession.directory || ""
    );
  }
  useSessionStore.getState().updateSession(sessionKey, {
    status: newStatus,
    statusUpdatedAt: Date.now(),
    lastActivity: Date.now()
  });
}
function handlePermissionEvent(serverId, event, notificationsEnabled) {
  if (!isPermissionUpdatedEvent(event)) {
    debug(`  Invalid permission.updated event structure`);
    return;
  }
  const { sessionID } = event.properties;
  if (!notificationsEnabled) return;
  const { sessions, servers } = useSessionStore.getState();
  for (const [key, session] of sessions) {
    if (getSessionId(key) === sessionID && session.serverId === serverId) {
      const server = servers.get(session.serverId);
      const serverName = server?.name || "Unknown server";
      const serverUrl = server?.url && server.url !== "disabled" ? server.url : "";
      debug(`  TRIGGERING permission notification for ${session.name}`);
      notifyPermissionRequired(
        session.name,
        serverName,
        serverUrl,
        session.originalId,
        session.directory || ""
      );
      useSessionStore.getState().updateSession(key, {
        status: "waiting_for_permission",
        statusUpdatedAt: Date.now(),
        lastActivity: Date.now()
      });
      break;
    }
  }
}
function handleSessionCreatedEvent(serverId, inFlight, lastFetchTime) {
  const wsClient = useConnectionStore.getState().wsClients.get(serverId);
  if (!wsClient) return;
  const lastFetch = lastFetchTime.get(serverId) || 0;
  const now = Date.now();
  if (now - lastFetch < CONFIG.debounce.sessionFetch) {
    debug(`[WS] Debouncing session.created for ${serverId}`);
    return;
  }
  if (inFlight.get(serverId)) {
    debug(`[WS] Skipping session.created for ${serverId} (fetch in flight)`);
    return;
  }
  lastFetchTime.set(serverId, now);
  inFlight.set(serverId, true);
  fetchSessionsWS(wsClient, serverId).then(async (serverSessions) => {
    if (!useConnectionStore.getState().wsClients.has(serverId)) return;
    useSessionStore.getState().mergeSessions(serverSessions);
    const visibleSessions = filterToCurrentSessionTree(serverSessions);
    debug(
      `[WS] Fetching details for ${visibleSessions.length} visible sessions after session.created`
    );
    const detailResults = await Promise.all(
      visibleSessions.map(
        (s) => fetchSessionDetailsWS(wsClient, serverId, s.originalId).catch(
          () => null
        )
      )
    );
    if (!useConnectionStore.getState().wsClients.has(serverId)) return;
    for (const details of detailResults) {
      if (details) {
        useSessionStore.getState().updateSession(details.id, details);
      }
    }
  }).finally(() => {
    inFlight.set(serverId, false);
  });
}
function handleSessionDeletedEvent(serverId, event) {
  const props = event.properties;
  const { info } = props;
  const { sessions, removeSession } = useSessionStore.getState();
  for (const [key, session] of sessions) {
    if (session.originalId === info.id && session.serverId === serverId) {
      removeSession(key);
      break;
    }
  }
}

// src/hooks/useSessionPolling.ts
import { useEffect as useEffect2, useRef as useRef2 } from "react";
function useSessionPolling() {
  const lastDetailsFetchRef = useRef2(0);
  const statusInFlightRef = useRef2(false);
  const detailsInFlightRef = useRef2(false);
  useEffect2(() => {
    const refreshStatus = async () => {
      if (statusInFlightRef.current) {
        debug("[Polling] Skipping status refresh (in flight)");
        return;
      }
      statusInFlightRef.current = true;
      try {
        const { servers, sessions, mergeSessions, updateSession } = useSessionStore.getState();
        const { wsClients } = useConnectionStore.getState();
        if (servers.size === 0) return;
        const serverResults = await Promise.all(
          Array.from(servers.keys()).map(async (serverId) => {
            const wsClient = wsClients.get(serverId);
            if (!wsClient) return [];
            try {
              const serverSessions = await fetchSessionsWS(wsClient, serverId);
              if (!useConnectionStore.getState().wsClients.has(serverId)) {
                debug(`[Polling] Skipping stale status update for ${serverId}`);
                return [];
              }
              return serverSessions;
            } catch (err) {
              debug(
                `[WS] Error refreshing status for ${serverId}: ${extractErrorMessage(err)}`
              );
              return [];
            }
          })
        );
        const allServerSessions = serverResults.flat();
        if (allServerSessions.length > 0) {
          for (const s of allServerSessions) {
            const existing = sessions.get(s.id);
            if (existing) {
              mergeSessions([
                {
                  ...s,
                  contextUsed: existing.contextUsed,
                  contextLimit: existing.contextLimit,
                  tokenBreakdown: existing.tokenBreakdown,
                  cost: existing.cost,
                  messageCount: existing.messageCount,
                  model: existing.model,
                  childCount: existing.childCount
                }
              ]);
            } else {
              mergeSessions([s]);
            }
          }
          const updatedSessions = useSessionStore.getState().sessions;
          const childCounts = calculateChildCounts(updatedSessions);
          for (const [id, session] of updatedSessions) {
            const key = `${session.serverId}:${session.originalId}`;
            const count = childCounts.get(key);
            if (count && count > 0) {
              updateSession(id, { childCount: count });
            } else if (session.childCount !== void 0) {
              updateSession(id, { childCount: void 0 });
            }
          }
        }
      } finally {
        statusInFlightRef.current = false;
      }
    };
    const refreshDetails = async () => {
      if (detailsInFlightRef.current) {
        debug("[Polling] Skipping details refresh (in flight)");
        return;
      }
      detailsInFlightRef.current = true;
      try {
        const { servers, updateSession } = useSessionStore.getState();
        const { wsClients } = useConnectionStore.getState();
        if (servers.size === 0) return;
        lastDetailsFetchRef.current = Date.now();
        debug("[Polling] Starting details refresh");
        await Promise.all(
          Array.from(servers.keys()).map(async (serverId) => {
            const wsClient = wsClients.get(serverId);
            if (!wsClient) return;
            try {
              const serverSessions = await fetchSessionsWS(wsClient, serverId);
              const visibleSessions = filterToCurrentSessionTree(serverSessions);
              const detailResults = await Promise.all(
                visibleSessions.map(
                  (s) => fetchSessionDetailsWS(wsClient, serverId, s.originalId).then(
                    (details) => {
                      if (!useConnectionStore.getState().wsClients.has(serverId))
                        return null;
                      return details;
                    }
                  )
                )
              );
              for (const details of detailResults) {
                if (details) {
                  updateSession(details.id, details);
                }
              }
            } catch (err) {
              debug(
                `[WS] Error refreshing details for ${serverId}: ${extractErrorMessage(err)}`
              );
            }
          })
        );
        debug("[Polling] Details refresh complete");
      } finally {
        detailsInFlightRef.current = false;
      }
    };
    const statusTimer = setInterval(
      refreshStatus,
      CONFIG.polling.statusInterval
    );
    const detailsTimer = setInterval(
      refreshDetails,
      CONFIG.polling.detailsInterval
    );
    const initialDetailsTimer = setTimeout(
      refreshDetails,
      CONFIG.polling.initialDetailsDelay
    );
    return () => {
      clearInterval(statusTimer);
      clearInterval(detailsTimer);
      clearTimeout(initialDetailsTimer);
    };
  }, []);
}

// src/hooks/useKeyboardNavigation.ts
import { useEffect as useEffect3, useRef as useRef3 } from "react";
import { useKeyboard } from "@opentui/react";

// src/lib/cache.ts
import { readFileSync, writeFileSync } from "fs";
import { tmpdir as tmpdir2 } from "os";
import { join as join2 } from "path";
function getCachePath() {
  const envPath = process.env[ENV_VARS.cacheFile];
  if (envPath) {
    return envPath;
  }
  return join2(tmpdir2(), "opencode-monitor-cache.json");
}
function saveCache(servers, sessions, collapsedServers) {
  try {
    const cache = {
      timestamp: Date.now(),
      servers: Array.from(servers.values()),
      sessions: Array.from(sessions.values())
    };
    if (collapsedServers && collapsedServers.size > 0) {
      cache.collapsedServers = Array.from(collapsedServers);
    }
    writeFileSync(getCachePath(), JSON.stringify(cache));
  } catch (err) {
    debug(`[Cache] Failed to save: ${extractErrorMessage(err)}`);
  }
}
function loadCache() {
  try {
    const data = readFileSync(getCachePath(), "utf-8");
    const cache = JSON.parse(data);
    if (Date.now() - cache.timestamp > CONFIG.cache.ttl) {
      return null;
    }
    return {
      servers: new Map(cache.servers.map((s) => [s.id, s])),
      sessions: new Map(cache.sessions.map((s) => [s.id, s])),
      collapsedServers: new Set(cache.collapsedServers ?? [])
    };
  } catch (err) {
    debug(`[Cache] Failed to load: ${extractErrorMessage(err)}`);
    return null;
  }
}

// src/hooks/useKeyboardNavigation.ts
async function isServerAvailable(serverUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONFIG.availability.checkTimeout
    );
    const response = await fetch(serverUrl, {
      method: "HEAD",
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
function checkServerAndExecute(serverUrl, serverName, modalType, setBrowserModal, onAvailable) {
  isServerAvailable(serverUrl).then((available) => {
    if (!available) {
      setBrowserModal({
        type: modalType,
        serverName,
        serverUrl
      });
    } else {
      onAvailable();
    }
  });
}
function getItemId(item) {
  return item.type === "session" ? item.node.session.id : item.serverId;
}
function useKeyboardNavigation({
  flatItems,
  selectedIndex,
  contentHeight,
  onExit,
  onLaunchTUI
}) {
  const setSelectedId = useUIStore((s) => s.setSelectedId);
  const browserModal = useUIStore((s) => s.browserModal);
  const setBrowserModal = useUIStore((s) => s.setBrowserModal);
  const toggleServerCollapsed = useUIStore((s) => s.toggleServerCollapsed);
  const toggleAllServers = useUIStore((s) => s.toggleAllServers);
  const selectedIndexRef = useRef3(selectedIndex);
  const flatItemsRef = useRef3(flatItems);
  const contentHeightRef = useRef3(contentHeight);
  const browserModalRef = useRef3(null);
  useEffect3(() => {
    selectedIndexRef.current = selectedIndex;
    flatItemsRef.current = flatItems;
    contentHeightRef.current = contentHeight;
    browserModalRef.current = browserModal;
  }, [selectedIndex, flatItems, contentHeight, browserModal]);
  useKeyboard((event) => {
    const currentIndex = selectedIndexRef.current;
    const currentItems = flatItemsRef.current;
    const currentHeight = contentHeightRef.current;
    const currentModal = browserModalRef.current;
    const currentServers = useSessionStore.getState().servers;
    const currentSessions = useSessionStore.getState().sessions;
    const input = event.name;
    const isReturn = event.name === "return";
    const isEscape = event.name === "escape";
    const isUpArrow = event.name === "up";
    const isDownArrow = event.name === "down";
    const isPageUp = event.name === "pageup";
    const isPageDown = event.name === "pagedown";
    if (currentModal) {
      if (currentModal.type === "server-unavailable" || currentModal.type === "tui-server-unavailable" || currentModal.type === "http-disabled" || currentModal.type === "http-disabled-tui") {
        if (isReturn || isEscape) {
          setBrowserModal(null);
        }
        return;
      }
      if (input === "y" || input === "Y") {
        checkServerAndExecute(
          currentModal.server.url,
          currentModal.server.name,
          "server-unavailable",
          setBrowserModal,
          () => {
            const url = buildSessionUrl(
              currentModal.server.url,
              currentModal.parentSession.directory || "",
              currentModal.parentSession.originalId
            );
            openInBrowser(url);
            setBrowserModal(null);
          }
        );
      } else if (input === "n" || input === "N" || isEscape) {
        setBrowserModal(null);
      }
      return;
    }
    if (input === "q") {
      const currentCollapsed = useUIStore.getState().collapsedServers;
      saveCache(currentServers, currentSessions, currentCollapsed);
      onExit();
    } else if (isUpArrow || input === "k") {
      const newIdx = currentIndex - 1;
      if (newIdx >= 0) {
        const newItem = currentItems[newIdx];
        if (newItem) setSelectedId(getItemId(newItem));
      }
    } else if (isDownArrow || input === "j") {
      const newIdx = currentIndex + 1;
      if (newIdx < currentItems.length) {
        const newItem = currentItems[newIdx];
        if (newItem) setSelectedId(getItemId(newItem));
      }
    } else if (isPageUp) {
      const newIdx = Math.max(0, currentIndex - currentHeight);
      if (newIdx < currentItems.length) {
        const newItem = currentItems[newIdx];
        if (newItem) setSelectedId(getItemId(newItem));
      }
    } else if (isPageDown) {
      const newIdx = Math.min(
        currentItems.length - 1,
        currentIndex + currentHeight
      );
      if (newIdx < currentItems.length) {
        const newItem = currentItems[newIdx];
        if (newItem) setSelectedId(getItemId(newItem));
      }
    } else if (input === "G") {
      const newIdx = currentItems.length - 1;
      if (newIdx >= 0) {
        const newItem = currentItems[newIdx];
        if (newItem) setSelectedId(getItemId(newItem));
      }
    } else if (input === "g") {
      if (currentItems.length > 0) {
        const newItem = currentItems[0];
        if (newItem) setSelectedId(getItemId(newItem));
      }
    } else if (input === "c" || input === "C") {
      const allServerIds = Array.from(
        new Set(
          currentItems.map(
            (item) => item.type === "group" ? item.serverId : item.node.session.serverId
          )
        )
      );
      toggleAllServers(allServerIds);
    } else if (input === "t" || input === "T" || isReturn) {
      const item = currentItems[currentIndex];
      if (item?.type === "session") {
        const session = item.node.session;
        const server = currentServers.get(session.serverId);
        if (server?.pending) return;
        const serverName = server?.name || "Unknown server";
        const serverUrl = server?.url || "";
        if (serverUrl === "disabled") {
          setBrowserModal({
            type: "http-disabled-tui",
            serverName
          });
          return;
        }
        checkServerAndExecute(
          serverUrl,
          serverName,
          "tui-server-unavailable",
          setBrowserModal,
          () => {
            const currentCollapsed = useUIStore.getState().collapsedServers;
            saveCache(currentServers, currentSessions, currentCollapsed);
            onLaunchTUI({
              serverUrl,
              sessionId: session.originalId,
              sessionName: session.name
            });
          }
        );
      }
    } else if (input === "b" || input === "B") {
      const item = currentItems[currentIndex];
      if (item?.type === "session") {
        const session = item.node.session;
        const server = currentServers.get(session.serverId);
        if (server?.pending) return;
        if (!server?.url || !session.directory) return;
        if (server.url === "disabled") {
          setBrowserModal({
            type: "http-disabled",
            serverName: server.name
          });
          return;
        }
        if (session.parentId) {
          const parentSession = Array.from(currentSessions.values()).find(
            (s) => s.originalId === session.parentId && s.serverId === session.serverId
          );
          if (parentSession) {
            setBrowserModal({
              type: "subagent",
              subagentName: session.name,
              parentSession,
              server
            });
          }
        } else {
          const directory = session.directory;
          checkServerAndExecute(
            server.url,
            server.name,
            "server-unavailable",
            setBrowserModal,
            () => {
              const url = buildSessionUrl(
                server.url,
                directory,
                session.originalId
              );
              openInBrowser(url);
            }
          );
        }
      }
    } else if (input === "space") {
      const item = currentItems[currentIndex];
      if (item?.type === "group") {
        toggleServerCollapsed(item.serverId);
      }
    }
  });
}

// src/components/SessionList.tsx
import { TextAttributes } from "@opentui/core";

// src/lib/format.ts
function getStatusColor(status, theme) {
  switch (status) {
    case "idle":
      return theme?.success ?? "green";
    case "busy":
      return theme?.primary ?? "blue";
    case "retry":
      return "magenta";
    case "waiting_for_permission":
      return theme?.warning ?? "yellow";
    case "completed":
      return theme?.textMuted ?? "gray";
    case "error":
    case "aborted":
      return theme?.error ?? "red";
    default:
      return theme?.text ?? "white";
  }
}
function formatTimestamp(timestamp) {
  const now = Date.now();
  const diffMs = now - timestamp;
  if (diffMs < 6e4) return `${Math.floor(diffMs / 1e3)}s ago`;
  if (diffMs < 36e5) return `${Math.floor(diffMs / 6e4)}m ago`;
  if (diffMs < 864e5) return `${Math.floor(diffMs / 36e5)}h ago`;
  const date = new Date(timestamp);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const hour12 = hours % 12 || 12;
  const ampm = hours < 12 ? "a" : "p";
  return `${month} ${day} ${hour12}:${minutes}${ampm}`;
}
function formatContextUsage(used, limit) {
  if (!used) return "";
  const usedStr = used >= 1e3 ? `${Math.round(used / 1e3)}k` : `${used}`;
  if (!limit || limit === 0) return usedStr;
  const percentage = Math.round(used / limit * 100);
  return `${usedStr} (${percentage}%)`;
}
function getContextUsageColor(used, limit, theme) {
  if (!used || !limit || limit === 0) return theme?.textMuted ?? "#666666";
  const ratio = used / limit;
  if (ratio > 0.8) return theme?.error ?? "#ff6b6b";
  if (ratio > 0.5) return theme?.warning ?? "#ffd93d";
  return theme?.success ?? "#6bcf7f";
}

// src/lib/text.ts
function truncateText(text, maxWidth) {
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - 1) + "\u2026";
}

// src/components/Spinner.tsx
import { useEffect as useEffect4, useState } from "react";

// src/components/primitives.tsx
import { jsx } from "@opentui/react/jsx-runtime";
function Row({
  children,
  flexGrow = 0,
  flexShrink = 1,
  flexWrap = "no-wrap",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "box",
    {
      flexDirection: "row",
      flexGrow,
      flexShrink,
      flexWrap,
      ...props,
      children
    }
  );
}
function Col({
  children,
  flexGrow = 0,
  flexShrink = 1,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "box",
    {
      flexDirection: "column",
      flexGrow,
      flexShrink,
      ...props,
      children
    }
  );
}

// src/components/Spinner.tsx
import { jsx as jsx2 } from "@opentui/react/jsx-runtime";
function Spinner({
  isBusy,
  theme
}) {
  const [frame, setFrame] = useState(0);
  const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
  useEffect4(() => {
    if (!isBusy) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % 10), 100);
    return () => clearInterval(timer);
  }, [isBusy]);
  if (!isBusy) return /* @__PURE__ */ jsx2(Row, { width: 2 });
  return /* @__PURE__ */ jsx2(Row, { width: 2, children: /* @__PURE__ */ jsx2("text", { fg: theme?.warning ?? "yellow", children: SPINNER_FRAMES[frame] ?? "\u280B" }) });
}

// src/themes/index.ts
import {
  existsSync,
  mkdirSync,
  readFileSync as readFileSync2,
  readdirSync,
  statSync
} from "fs";
import { homedir as homedir2 } from "os";
import { join as join3 } from "path";
var THEME_KEYS = /* @__PURE__ */ new Set([
  "bg",
  "surface",
  "text",
  "textMuted",
  "primary",
  "border",
  "error",
  "warning",
  "success"
]);
var DEFAULT_THEME = {
  name: "default",
  bg: "#1a1a1a",
  surface: "#264f78",
  text: "#cccccc",
  textMuted: "#666666",
  primary: "blue",
  border: "#666666",
  error: "red",
  warning: "yellow",
  success: "green"
};
var GRUVBOX_THEME = {
  name: "gruvbox",
  bg: "#f2e5bc",
  surface: "#ebdbb2",
  text: "#3c3836",
  textMuted: "#7c6f64",
  primary: "#b57614",
  border: "#d5c4a1",
  error: "#9d0006",
  warning: "#af3a03",
  success: "#79740e"
};
var BUILT_IN_THEMES = {
  default: DEFAULT_THEME,
  gruvbox: GRUVBOX_THEME
};
function getThemedTextProps(theme) {
  return { fg: theme.text };
}
function getThemedBoxProps(theme) {
  return { backgroundColor: theme.bg };
}
function getSelectedTextColor(theme) {
  return theme.text;
}
function normalizeKey(key) {
  return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}
function parseFlatToml(input) {
  const values = {};
  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const match = line.match(
      /^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"\s*(?:#.*)?$/
    );
    if (!match?.[1] || match[2] === void 0) {
      throw new Error(
        `Unsupported TOML line ${index + 1}: ${line}. Expected key = "value".`
      );
    }
    values[normalizeKey(match[1])] = match[2];
  });
  return values;
}
function parseThemeFlag(args) {
  const themeIndex = args.indexOf("--theme");
  if (themeIndex === -1) return void 0;
  const theme = args[themeIndex + 1];
  if (!theme || theme.startsWith("--")) {
    throw new Error("Missing value for --theme.");
  }
  return theme;
}
function getMonitorConfigDir(configHome = join3(homedir2(), ".config")) {
  const configDir = join3(configHome, "oc-mon");
  mkdirSync(join3(configDir, "themes"), { recursive: true });
  return configDir;
}
function getThemesDir(configHome) {
  return join3(getMonitorConfigDir(configHome), "themes");
}
function parseMonitorConfig(path) {
  const values = parseFlatToml(readFileSync2(path, "utf8"));
  const theme = values.theme;
  return theme ? { theme } : {};
}
function getConfigTheme(configHome) {
  const configPath = join3(getMonitorConfigDir(configHome), "config.toml");
  if (!existsSync(configPath)) return void 0;
  return parseMonitorConfig(configPath).theme;
}
function listUserThemes(configHome) {
  const themesDir = getThemesDir(configHome);
  if (!existsSync(themesDir)) return [];
  return readdirSync(themesDir).filter((entry) => entry.endsWith(".toml")).filter((entry) => statSync(join3(themesDir, entry)).isFile()).map((entry) => entry.replace(/\.toml$/, ""));
}
function parseThemeFile(path, name) {
  const values = parseFlatToml(readFileSync2(path, "utf8"));
  const overrides = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "theme" || key === "name") continue;
    if (!THEME_KEYS.has(key)) {
      throw new Error(`Unsupported theme token "${key}" in ${path}.`);
    }
    overrides[key] = value;
  }
  return { ...DEFAULT_THEME, ...overrides, name };
}
function loadThemeByName(name, configHome) {
  const builtIn = BUILT_IN_THEMES[name];
  if (builtIn) return builtIn;
  const themePath = join3(getThemesDir(configHome), `${name}.toml`);
  if (existsSync(themePath)) return parseThemeFile(themePath, name);
  const availableThemes = Array.from(
    /* @__PURE__ */ new Set([...listUserThemes(configHome), ...Object.keys(BUILT_IN_THEMES)])
  ).sort();
  const available = availableThemes.length ? availableThemes.map((themeName) => `- ${themeName}`).join("\n") : "- default\n- gruvbox";
  throw new Error(
    `Unknown theme "${name}".

Looked for:
- ${themePath}

Available themes:
${available}`
  );
}
function resolveTheme(options = {}) {
  const selectedTheme = options.cliTheme ?? getConfigTheme(options.configHome);
  if (!selectedTheme) return DEFAULT_THEME;
  return loadThemeByName(selectedTheme, options.configHome);
}

// src/components/SessionList.tsx
import { Fragment, jsx as jsx3, jsxs } from "@opentui/react/jsx-runtime";
function renderSessionName(name, maxWidth, isSelected, theme) {
  const safeName = name || "";
  const subagentMatch = safeName.match(
    /^(.+?)\s*\(@(\w+(?:-\w+)*)\s+subagent\)$/
  );
  if (subagentMatch) {
    const mainName = subagentMatch[1] || "";
    const agentType = subagentMatch[2] || "";
    const suffix = ` @${agentType}`;
    const availableForMain = maxWidth - suffix.length;
    const truncatedMain = truncateText(mainName, availableForMain);
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx3(
        "text",
        {
          style: {
            attributes: isSelected ? TextAttributes.BOLD : TextAttributes.NONE
          },
          fg: isSelected ? getSelectedTextColor(theme) : theme.text,
          children: truncatedMain
        }
      ),
      /* @__PURE__ */ jsx3("text", { fg: isSelected ? theme.text : theme.textMuted, children: suffix })
    ] });
  }
  return /* @__PURE__ */ jsx3(
    "text",
    {
      style: {
        attributes: isSelected ? TextAttributes.BOLD : TextAttributes.NONE
      },
      fg: isSelected ? getSelectedTextColor(theme) : theme.text,
      children: truncateText(safeName, maxWidth)
    }
  );
}
function SessionStatus({
  session,
  isPending,
  isSelected,
  theme
}) {
  const dimColor = theme.textMuted;
  if (isPending) {
    return /* @__PURE__ */ jsx3("text", { fg: dimColor, children: "\u25CB" });
  }
  if (session.status === "busy" || session.status === "retry") {
    return /* @__PURE__ */ jsx3(Spinner, { isBusy: true, theme });
  }
  if (session.status === "waiting_for_permission") {
    return /* @__PURE__ */ jsx3("text", { style: { attributes: TextAttributes.BOLD }, fg: theme.warning, children: "\u25C9" });
  }
  if (session.status === "idle") {
    return /* @__PURE__ */ jsx3("text", { fg: isSelected ? getSelectedTextColor(theme) : theme.success, children: "\u25CF" });
  }
  if (session.status === "completed") {
    return /* @__PURE__ */ jsx3("text", { fg: isSelected ? getSelectedTextColor(theme) : theme.textMuted, children: "\u25CB" });
  }
  if (session.status === "error" || session.status === "aborted") {
    return /* @__PURE__ */ jsx3("text", { fg: isSelected ? getSelectedTextColor(theme) : theme.error, children: "\u2715" });
  }
  return /* @__PURE__ */ jsx3(
    "text",
    {
      fg: isSelected ? getSelectedTextColor(theme) : getStatusColor(session.status, theme),
      children: "\u25CF"
    }
  );
}
function ServerGroupRow({
  serverId,
  server,
  nodeCount,
  isSelected,
  isCollapsed,
  theme
}) {
  const serverName = server?.name || serverId;
  const isPending = server?.pending === true;
  const indicator = isCollapsed ? "\u25B6" : "\u25BC";
  return /* @__PURE__ */ jsx3(
    Row,
    {
      backgroundColor: isSelected ? theme.surface : theme.bg,
      paddingLeft: 1,
      paddingRight: 1,
      children: /* @__PURE__ */ jsx3(
        "text",
        {
          style: { attributes: TextAttributes.BOLD },
          fg: isSelected ? getSelectedTextColor(theme) : isPending ? theme.textMuted : theme.primary,
          children: `${indicator} ${serverName} (${nodeCount})`
        }
      )
    },
    `group-${serverId}`
  );
}
function SessionRow({
  node,
  server,
  isSelected,
  listWidth,
  theme
}) {
  const session = node.session;
  const isPending = server?.pending === true;
  const treePrefixWidth = node.treePrefix.length;
  const dimColor = theme.textMuted;
  const statusW = 3;
  const timeW = 13;
  const tokensW = 9;
  const contextW = 16;
  const nameW = Math.max(
    20,
    listWidth - statusW - timeW - tokensW - contextW - treePrefixWidth - 2
  );
  return /* @__PURE__ */ jsxs(
    Row,
    {
      ...isSelected ? { backgroundColor: theme.surface } : {},
      paddingLeft: 1,
      paddingRight: 1,
      children: [
        node.treePrefix ? /* @__PURE__ */ jsx3("text", { fg: isSelected ? theme.text : dimColor, children: node.treePrefix }) : null,
        /* @__PURE__ */ jsx3(Row, { width: statusW, children: /* @__PURE__ */ jsx3(
          SessionStatus,
          {
            session,
            isPending,
            isSelected,
            theme
          }
        ) }),
        /* @__PURE__ */ jsx3(Row, { width: nameW, children: isPending ? /* @__PURE__ */ jsx3("text", { fg: dimColor, children: truncateText(session.name || "", nameW) }) : renderSessionName(session.name || "", nameW, isSelected, theme) }),
        /* @__PURE__ */ jsx3(Row, { width: contextW, justifyContent: "flex-end", paddingRight: 1, children: /* @__PURE__ */ jsx3(
          "text",
          {
            fg: isPending ? dimColor : isSelected ? theme.text : getContextUsageColor(
              session.contextUsed,
              session.contextLimit,
              theme
            ),
            children: formatContextUsage(session.contextUsed, session.contextLimit)
          }
        ) }),
        /* @__PURE__ */ jsx3(Row, { width: tokensW, justifyContent: "flex-end", paddingRight: 1, children: /* @__PURE__ */ jsx3(
          "text",
          {
            fg: isPending ? dimColor : isSelected ? theme.text : theme.textMuted,
            children: session.tokens !== void 0 && session.tokens >= 1e3 ? `${Math.round(session.tokens / 1e3)}k` : session.tokens !== void 0 ? String(session.tokens) : ""
          }
        ) }),
        /* @__PURE__ */ jsx3(Row, { width: timeW, justifyContent: "flex-end", children: /* @__PURE__ */ jsx3(
          "text",
          {
            fg: isPending ? dimColor : isSelected ? theme.text : theme.textMuted,
            children: formatTimestamp(session.lastActivity)
          }
        ) })
      ]
    },
    `session-${session.id}`
  );
}
function SessionList({
  visibleItems,
  scrollOffset,
  selectedIndex,
  listWidth,
  totalItems,
  servers,
  nodesByServer,
  collapsedServers,
  theme
}) {
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + visibleItems.length < totalItems;
  const moreAboveCount = scrollOffset;
  const moreBelowCount = totalItems - scrollOffset - visibleItems.length;
  if (servers.size === 0) {
    return /* @__PURE__ */ jsx3(Col, { width: listWidth, flexGrow: 1, ...getThemedBoxProps(theme), children: /* @__PURE__ */ jsx3(
      Col,
      {
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
        paddingBottom: 1,
        ...getThemedBoxProps(theme),
        children: /* @__PURE__ */ jsx3("text", { style: { attributes: TextAttributes.DIM }, fg: theme.textMuted, children: "Waiting for OpenCode servers..." })
      }
    ) });
  }
  return /* @__PURE__ */ jsxs(Col, { width: listWidth, flexGrow: 1, ...getThemedBoxProps(theme), children: [
    hasMoreAbove ? /* @__PURE__ */ jsx3(Row, { justifyContent: "center", ...getThemedBoxProps(theme), children: /* @__PURE__ */ jsx3("text", { fg: theme.primary, children: `\u25B2 ${moreAboveCount} more above` }) }) : null,
    visibleItems.map((item, visibleIdx) => {
      const absoluteIdx = scrollOffset + visibleIdx;
      const isSelected = absoluteIdx === selectedIndex;
      if (item.type === "group") {
        const server2 = servers.get(item.serverId);
        const groupNodes = nodesByServer.get(item.serverId) || [];
        const isCollapsed = collapsedServers.has(item.serverId);
        return /* @__PURE__ */ jsx3(
          ServerGroupRow,
          {
            serverId: item.serverId,
            server: server2,
            nodeCount: groupNodes.length,
            isSelected,
            isCollapsed,
            theme
          },
          `group-${item.serverId}`
        );
      }
      const server = servers.get(item.node.session.serverId);
      return /* @__PURE__ */ jsx3(
        SessionRow,
        {
          node: item.node,
          server,
          isSelected,
          listWidth,
          theme
        },
        `session-${item.node.session.id}`
      );
    }),
    /* @__PURE__ */ jsx3(Col, { flexGrow: 1, ...getThemedBoxProps(theme) }),
    hasMoreBelow ? /* @__PURE__ */ jsx3(Row, { justifyContent: "center", ...getThemedBoxProps(theme), children: /* @__PURE__ */ jsx3("text", { fg: theme.primary, children: `\u25BC ${moreBelowCount} more below` }) }) : null
  ] });
}

// src/lib/version.ts
function getInjectedVersionString() {
  return true ? "oc-mon v1.0.1-531a17" : void 0;
}
function getVersionString() {
  return getInjectedVersionString() ?? `${APP_NAME} v0.0.0-dev`;
}

// src/components/SessionDetails.tsx
import { useMemo } from "react";
import { TextAttributes as TextAttributes2 } from "@opentui/core";
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs2 } from "@opentui/react/jsx-runtime";
function SectionDivider({
  title,
  panelWidth,
  theme
}) {
  const dividerLine = "\u2500".repeat(Math.max(0, panelWidth - title.length - 7));
  return /* @__PURE__ */ jsxs2(Row, { marginTop: 1, children: [
    /* @__PURE__ */ jsx4("text", { fg: theme.textMuted, children: `\u2500\u2500 ${title} ` }),
    /* @__PURE__ */ jsx4("text", { fg: theme.border, children: dividerLine })
  ] });
}
function formatDirectory(dir) {
  const home = process.env.HOME || "";
  if (home && dir.startsWith(home)) {
    return "~" + dir.slice(home.length);
  }
  return dir;
}
function LabeledValue({
  label,
  value,
  valueColor,
  labelStyle,
  valueStyle
}) {
  const labelAttrs = labelStyle ?? TextAttributes2.BOLD | TextAttributes2.DIM;
  const valueAttrs = valueStyle ?? TextAttributes2.DIM;
  if (valueColor) {
    return /* @__PURE__ */ jsxs2("text", { children: [
      /* @__PURE__ */ jsx4("span", { style: { attributes: labelAttrs }, children: label }),
      /* @__PURE__ */ jsx4("span", { style: { attributes: valueAttrs }, fg: valueColor, children: value })
    ] });
  }
  return /* @__PURE__ */ jsxs2("text", { children: [
    /* @__PURE__ */ jsx4("span", { style: { attributes: labelAttrs }, children: label }),
    /* @__PURE__ */ jsx4("span", { style: { attributes: valueAttrs }, children: value })
  ] });
}
function SessionDetails({
  session,
  server,
  panelWidth,
  nodesByServer,
  theme = DEFAULT_THEME
}) {
  const ageStr = useMemo(() => {
    const age = Date.now() - session.createdAt;
    if (age < 36e5) return `${Math.floor(age / 6e4)}m`;
    if (age < 864e5) return `${Math.floor(age / 36e5)}h`;
    return `${Math.floor(age / 864e5)}d`;
  }, [session.createdAt]);
  const contextStr = useMemo(() => {
    if (!session.contextUsed) return "";
    const used = session.contextUsed.toLocaleString();
    if (session.contextLimit) {
      const pct = Math.round(
        session.contextUsed / session.contextLimit * 100
      );
      return `${used}  ${pct}%`;
    }
    return used;
  }, [session.contextUsed, session.contextLimit]);
  const costStr = useMemo(() => {
    if (!session.cost) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(session.cost);
  }, [session.cost]);
  const childCount = useMemo(
    () => (nodesByServer.get(session.serverId) || []).filter(
      (n) => n.session.parentId === session.originalId
    ).length,
    [nodesByServer, session.serverId, session.originalId]
  );
  const dimBold = TextAttributes2.BOLD | TextAttributes2.DIM;
  const dim = TextAttributes2.DIM;
  const sessionId = (session.originalId || "").slice(-8);
  const statusValue = session.status || "idle";
  const statusColor = getStatusColor(statusValue, theme);
  const messageCountStr = session.messageCount !== void 0 && session.messageCount > 0 ? String(session.messageCount) : "";
  const contextColor = getContextUsageColor(
    session.contextUsed,
    session.contextLimit,
    theme
  );
  const modelStr = session.model ? `${session.model.provider || "unknown"} / ${session.model.model || "unknown"}` : "";
  const statusUpdatedStr = session.statusUpdatedAt !== void 0 ? new Date(session.statusUpdatedAt).toLocaleTimeString() : "";
  const projectStr = session.project ? truncateText(session.project, panelWidth - 12) : "";
  const directoryStr = session.directory ? formatDirectory(session.directory) : "";
  const serverNameStr = server?.name || "unknown";
  const serverUrlStr = server?.url || "";
  const parentIdStr = session.parentId ? (session.parentId || "").slice(-8) : "";
  const childCountStr = childCount > 0 ? String(childCount) : "";
  const inputStr = session.tokenBreakdown ? session.tokenBreakdown.input.toLocaleString().padStart(8) : "";
  const outputStr = session.tokenBreakdown ? session.tokenBreakdown.output.toLocaleString().padStart(8) : "";
  const cacheReadStr = session.tokenBreakdown ? session.tokenBreakdown.cacheRead.toLocaleString() : "";
  const cacheWriteStr = session.tokenBreakdown ? session.tokenBreakdown.cacheWrite.toLocaleString() : "";
  const reasoningStr = session.tokenBreakdown && session.tokenBreakdown.reasoning > 0 ? session.tokenBreakdown.reasoning.toLocaleString() : "";
  const showUsage = contextStr !== "" || costStr !== "";
  const showTokens = session.tokenBreakdown !== void 0;
  const showModel = modelStr !== "";
  const showHierarchy = parentIdStr !== "" || childCountStr !== "";
  return /* @__PURE__ */ jsxs2(Col, { marginTop: 1, children: [
    /* @__PURE__ */ jsxs2(Row, { justifyContent: "space-between", children: [
      /* @__PURE__ */ jsx4(LabeledValue, { label: "ID: ", value: sessionId }),
      /* @__PURE__ */ jsx4(
        LabeledValue,
        {
          label: "Status: ",
          value: statusValue,
          valueColor: statusColor,
          valueStyle: 0
        }
      )
    ] }),
    /* @__PURE__ */ jsxs2(Row, { justifyContent: "space-between", children: [
      /* @__PURE__ */ jsx4(LabeledValue, { label: "Age: ", value: ageStr }),
      messageCountStr !== "" ? /* @__PURE__ */ jsx4(LabeledValue, { label: "Messages: ", value: messageCountStr }) : null
    ] }),
    showUsage ? /* @__PURE__ */ jsxs2(Col, { children: [
      /* @__PURE__ */ jsx4(SectionDivider, { title: "Usage", panelWidth, theme }),
      contextStr !== "" ? /* @__PURE__ */ jsx4(
        LabeledValue,
        {
          label: "Context: ",
          value: contextStr,
          valueColor: contextColor
        }
      ) : null,
      costStr !== "" ? /* @__PURE__ */ jsx4(LabeledValue, { label: "Cost: ", value: costStr }) : null
    ] }) : null,
    showTokens ? /* @__PURE__ */ jsxs2(Col, { children: [
      /* @__PURE__ */ jsx4(
        SectionDivider,
        {
          title: "Tokens",
          panelWidth,
          theme
        }
      ),
      /* @__PURE__ */ jsxs2(Row, { justifyContent: "space-between", children: [
        /* @__PURE__ */ jsx4(LabeledValue, { label: "Input: ", value: inputStr }),
        /* @__PURE__ */ jsx4(LabeledValue, { label: "Cache R: ", value: cacheReadStr })
      ] }),
      /* @__PURE__ */ jsxs2(Row, { justifyContent: "space-between", children: [
        /* @__PURE__ */ jsx4(LabeledValue, { label: "Output: ", value: outputStr }),
        /* @__PURE__ */ jsx4(LabeledValue, { label: "Cache W: ", value: cacheWriteStr })
      ] }),
      reasoningStr !== "" ? /* @__PURE__ */ jsx4(LabeledValue, { label: "Reasoning: ", value: reasoningStr }) : null
    ] }) : null,
    showModel ? /* @__PURE__ */ jsxs2(Col, { children: [
      /* @__PURE__ */ jsx4(SectionDivider, { title: "Model", panelWidth, theme }),
      /* @__PURE__ */ jsx4("text", { style: { attributes: dim }, fg: theme.textMuted, children: modelStr })
    ] }) : null,
    /* @__PURE__ */ jsx4(SectionDivider, { title: "Location", panelWidth, theme }),
    statusUpdatedStr !== "" ? /* @__PURE__ */ jsx4(Row, { marginBottom: 1, children: /* @__PURE__ */ jsx4(LabeledValue, { label: "Status updated: ", value: statusUpdatedStr }) }) : null,
    projectStr !== "" ? /* @__PURE__ */ jsx4(LabeledValue, { label: "Project: ", value: projectStr }) : null,
    directoryStr !== "" ? /* @__PURE__ */ jsxs2(Col, { marginTop: 1, children: [
      /* @__PURE__ */ jsx4("text", { style: { attributes: dimBold }, fg: theme.textMuted, children: "Directory:" }),
      /* @__PURE__ */ jsx4(Row, { paddingLeft: 1, children: /* @__PURE__ */ jsx4("text", { style: { attributes: dim }, fg: theme.textMuted, children: directoryStr }) })
    ] }) : null,
    server ? /* @__PURE__ */ jsx4(Col, { marginTop: 1, children: serverUrlStr === "disabled" ? /* @__PURE__ */ jsxs2("text", { children: [
      /* @__PURE__ */ jsx4("span", { style: { attributes: dimBold }, fg: theme.textMuted, children: "Server: " }),
      /* @__PURE__ */ jsx4("span", { style: { attributes: dim }, fg: theme.textMuted, children: serverNameStr }),
      /* @__PURE__ */ jsx4("span", { fg: theme.warning, children: " (HTTP Disabled)" })
    ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsx4(LabeledValue, { label: "Server: ", value: serverNameStr }),
      /* @__PURE__ */ jsx4(Row, { paddingLeft: 1, children: /* @__PURE__ */ jsx4("text", { style: { attributes: dim }, fg: theme.textMuted, children: serverUrlStr }) })
    ] }) }) : null,
    showHierarchy ? /* @__PURE__ */ jsxs2(Col, { children: [
      /* @__PURE__ */ jsx4(
        SectionDivider,
        {
          title: "Hierarchy",
          panelWidth,
          theme
        }
      ),
      parentIdStr !== "" ? /* @__PURE__ */ jsx4(LabeledValue, { label: "Parent: ", value: parentIdStr }) : null,
      childCountStr !== "" ? /* @__PURE__ */ jsx4(LabeledValue, { label: "Children: ", value: childCountStr }) : null
    ] }) : null
  ] });
}

// src/components/ServerDetails.tsx
import { TextAttributes as TextAttributes3 } from "@opentui/core";
import { jsx as jsx5, jsxs as jsxs3 } from "@opentui/react/jsx-runtime";
function SectionDivider2({
  title,
  panelWidth,
  theme
}) {
  const dividerLine = "\u2500".repeat(Math.max(0, panelWidth - title.length - 7));
  return /* @__PURE__ */ jsxs3(Row, { marginTop: 1, children: [
    /* @__PURE__ */ jsx5("text", { fg: theme.textMuted, children: `\u2500\u2500 ${title} ` }),
    /* @__PURE__ */ jsx5("text", { fg: theme.border, children: dividerLine })
  ] });
}
function LabeledValue2({
  label,
  value,
  valueColor,
  labelStyle,
  valueStyle,
  theme = DEFAULT_THEME
}) {
  const labelAttrs = labelStyle ?? TextAttributes3.BOLD | TextAttributes3.DIM;
  const valueAttrs = valueStyle ?? TextAttributes3.DIM;
  if (valueColor) {
    return /* @__PURE__ */ jsxs3("text", { children: [
      /* @__PURE__ */ jsx5("span", { style: { attributes: labelAttrs }, fg: theme.textMuted, children: label }),
      /* @__PURE__ */ jsx5("span", { style: { attributes: valueAttrs }, fg: valueColor, children: value })
    ] });
  }
  return /* @__PURE__ */ jsxs3("text", { children: [
    /* @__PURE__ */ jsx5("span", { style: { attributes: labelAttrs }, fg: theme.textMuted, children: label }),
    /* @__PURE__ */ jsx5("span", { style: { attributes: valueAttrs }, fg: theme.textMuted, children: value })
  ] });
}
function ServerDetails({
  server,
  serverSessions,
  panelWidth,
  theme = DEFAULT_THEME
}) {
  const dim = TextAttributes3.DIM;
  const dimBold = TextAttributes3.BOLD | TextAttributes3.DIM;
  const isConnected = !server.pending;
  const statusStr = isConnected ? "Connected" : "Pending";
  const statusColor = isConnected ? theme.success : theme.warning;
  const lastSeenStr = new Date(server.lastSeen).toLocaleTimeString();
  const totalSessions = serverSessions.length;
  const activeSessions = serverSessions.filter(
    (s) => s.status === "busy" || s.status === "retry"
  ).length;
  const idleSessions = serverSessions.filter((s) => s.status === "idle").length;
  const waitingSessions = serverSessions.filter(
    (s) => s.status === "waiting_for_permission"
  ).length;
  const completedSessions = serverSessions.filter(
    (s) => s.status === "completed"
  ).length;
  const errorSessions = serverSessions.filter(
    (s) => s.status === "error" || s.status === "aborted"
  ).length;
  const totalTokens = serverSessions.reduce(
    (sum, s) => sum + (s.tokens || 0),
    0
  );
  const totalCost = serverSessions.reduce((sum, s) => sum + (s.cost || 0), 0);
  const serverIdStr = server.id.slice(-8);
  const totalTokensStr = totalTokens > 0 ? totalTokens.toLocaleString() : "";
  const totalCostStr = totalCost > 0 ? new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(totalCost) : "";
  const showUsage = totalTokensStr !== "" || totalCostStr !== "";
  return /* @__PURE__ */ jsxs3(Col, { marginTop: 1, children: [
    /* @__PURE__ */ jsxs3(Row, { justifyContent: "space-between", children: [
      /* @__PURE__ */ jsx5(LabeledValue2, { label: "ID: ", value: serverIdStr, theme }),
      /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Status: ",
          value: statusStr,
          valueColor: statusColor,
          valueStyle: 0,
          theme
        }
      )
    ] }),
    /* @__PURE__ */ jsx5(LabeledValue2, { label: "Last seen: ", value: lastSeenStr, theme }),
    /* @__PURE__ */ jsx5(SectionDivider2, { title: "Sessions", panelWidth, theme }),
    /* @__PURE__ */ jsxs3(Row, { justifyContent: "space-between", children: [
      /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Total: ",
          value: String(totalSessions),
          theme
        }
      ),
      activeSessions > 0 ? /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Active: ",
          value: String(activeSessions),
          valueColor: theme.primary,
          theme
        }
      ) : null
    ] }),
    /* @__PURE__ */ jsxs3(Row, { justifyContent: "space-between", children: [
      idleSessions > 0 ? /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Idle: ",
          value: String(idleSessions),
          valueColor: theme.success,
          theme
        }
      ) : null,
      waitingSessions > 0 ? /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Waiting: ",
          value: String(waitingSessions),
          valueColor: theme.warning,
          theme
        }
      ) : null
    ] }),
    completedSessions > 0 || errorSessions > 0 ? /* @__PURE__ */ jsxs3(Row, { justifyContent: "space-between", children: [
      completedSessions > 0 ? /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Completed: ",
          value: String(completedSessions),
          theme
        }
      ) : null,
      errorSessions > 0 ? /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Errors: ",
          value: String(errorSessions),
          valueColor: theme.error,
          theme
        }
      ) : null
    ] }) : null,
    /* @__PURE__ */ jsx5(SectionDivider2, { title: "Location", panelWidth, theme }),
    server.project ? /* @__PURE__ */ jsx5(LabeledValue2, { label: "Project: ", value: server.project, theme }) : null,
    server.branch ? /* @__PURE__ */ jsx5(LabeledValue2, { label: "Branch: ", value: server.branch, theme }) : null,
    server.url ? server.url === "disabled" ? /* @__PURE__ */ jsxs3(Col, { marginTop: 1, children: [
      /* @__PURE__ */ jsx5("text", { style: { attributes: dimBold }, fg: theme.textMuted, children: "HTTP Server:" }),
      /* @__PURE__ */ jsx5(Row, { paddingLeft: 1, children: /* @__PURE__ */ jsx5("text", { fg: theme.warning, children: "Disabled" }) })
    ] }) : /* @__PURE__ */ jsxs3(Col, { marginTop: 1, children: [
      /* @__PURE__ */ jsx5("text", { style: { attributes: dimBold }, fg: theme.textMuted, children: "URL:" }),
      /* @__PURE__ */ jsx5(Row, { paddingLeft: 1, children: /* @__PURE__ */ jsx5("text", { style: { attributes: dim }, fg: theme.textMuted, children: server.url }) })
    ] }) : null,
    showUsage ? /* @__PURE__ */ jsxs3(Col, { children: [
      /* @__PURE__ */ jsx5(SectionDivider2, { title: "Usage", panelWidth, theme }),
      totalTokensStr !== "" ? /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Total tokens: ",
          value: totalTokensStr,
          theme
        }
      ) : null,
      totalCostStr !== "" ? /* @__PURE__ */ jsx5(
        LabeledValue2,
        {
          label: "Total cost: ",
          value: totalCostStr,
          theme
        }
      ) : null
    ] }) : null
  ] });
}

// src/components/BrowserModal.tsx
import { TextAttributes as TextAttributes4 } from "@opentui/core";
import { jsx as jsx6, jsxs as jsxs4 } from "@opentui/react/jsx-runtime";
function ModalContainer({
  screenWidth,
  screenHeight,
  modalWidth,
  borderColor,
  backgroundColor,
  children
}) {
  return /* @__PURE__ */ jsx6(
    Col,
    {
      position: "absolute",
      backgroundColor,
      border: true,
      borderStyle: "rounded",
      borderColor,
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      marginLeft: Math.floor((screenWidth - modalWidth) / 2),
      marginTop: Math.floor((screenHeight - 10) / 2),
      width: modalWidth,
      children
    }
  );
}
function BrowserModal({
  modal,
  width,
  height,
  theme = DEFAULT_THEME
}) {
  if (!modal) return null;
  if (modal.type === "subagent") {
    return /* @__PURE__ */ jsxs4(
      ModalContainer,
      {
        screenWidth: width,
        screenHeight: height,
        modalWidth: CONFIG.modal.subagentWidth,
        borderColor: theme.warning,
        backgroundColor: theme.bg,
        children: [
          /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: theme.warning, children: "Cannot Open Subagent in Browser" }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { children: "OpenCode's web UI doesn't support" }),
            /* @__PURE__ */ jsx6("text", { children: "direct links to subagent sessions." })
          ] }),
          /* @__PURE__ */ jsx6(Row, { marginTop: 1, children: /* @__PURE__ */ jsx6("text", { children: "Open the parent session instead?" }) }),
          /* @__PURE__ */ jsxs4(Row, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.DIM }, children: "Parent: " }),
            /* @__PURE__ */ jsx6("text", { children: truncateText(modal.parentSession.name || "Unknown", 28) })
          ] }),
          /* @__PURE__ */ jsxs4(Row, { marginTop: 1, justifyContent: "center", children: [
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: theme.success, children: "[Y]" }),
            /* @__PURE__ */ jsx6("text", { children: " Open Parent " }),
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: theme.error, children: "[N]" }),
            /* @__PURE__ */ jsx6("text", { children: " Cancel" })
          ] })
        ]
      }
    );
  }
  if (modal.type === "server-unavailable") {
    return /* @__PURE__ */ jsxs4(
      ModalContainer,
      {
        screenWidth: width,
        screenHeight: height,
        modalWidth: CONFIG.modal.serverUnavailableWidth,
        borderColor: theme.error,
        backgroundColor: theme.bg,
        children: [
          /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: theme.error, children: "Server Unavailable" }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { children: "Cannot reach server:" }),
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, children: modal.serverName })
          ] }),
          /* @__PURE__ */ jsx6(Row, { marginTop: 1, children: /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.DIM }, children: modal.serverUrl }) }),
          /* @__PURE__ */ jsx6(Row, { marginTop: 1, children: /* @__PURE__ */ jsx6("text", { children: "The server may have shut down." }) }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.DIM }, children: "Tip: For remote access, start OpenCode with:" }),
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.DIM }, children: "    opencode --hostname 0.0.0.0" })
          ] }),
          /* @__PURE__ */ jsxs4(Row, { marginTop: 1, justifyContent: "center", children: [
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: "gray", children: "[Enter]" }),
            /* @__PURE__ */ jsx6("text", { children: " OK" })
          ] })
        ]
      }
    );
  }
  if (modal.type === "tui-server-unavailable") {
    return /* @__PURE__ */ jsxs4(
      ModalContainer,
      {
        screenWidth: width,
        screenHeight: height,
        modalWidth: CONFIG.modal.tuiServerUnavailableWidth,
        borderColor: theme.error,
        backgroundColor: theme.bg,
        children: [
          /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: theme.error, children: "Cannot Attach to Session" }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { children: "Cannot reach server:" }),
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, children: modal.serverName })
          ] }),
          /* @__PURE__ */ jsx6(Row, { marginTop: 1, children: /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.DIM }, children: modal.serverUrl }) }),
          /* @__PURE__ */ jsx6(Row, { marginTop: 1, children: /* @__PURE__ */ jsx6("text", { children: "Server is not reachable from this machine." }) }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.DIM }, children: "Tip: For remote access, start OpenCode with:" }),
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.DIM }, children: "    opencode --hostname 0.0.0.0" })
          ] }),
          /* @__PURE__ */ jsxs4(Row, { marginTop: 1, justifyContent: "center", children: [
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: "gray", children: "[Enter]" }),
            /* @__PURE__ */ jsx6("text", { children: " OK" })
          ] })
        ]
      }
    );
  }
  if (modal.type === "http-disabled") {
    return /* @__PURE__ */ jsxs4(
      ModalContainer,
      {
        screenWidth: width,
        screenHeight: height,
        modalWidth: CONFIG.modal.serverUnavailableWidth,
        borderColor: theme.warning,
        backgroundColor: theme.bg,
        children: [
          /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: theme.warning, children: "Cannot Open in Browser" }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { children: "HTTP server is not enabled for:" }),
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, children: modal.serverName })
          ] }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { children: "OpenCode must be configured or started" }),
            /* @__PURE__ */ jsx6("text", { children: "with HTTP server enabled to use" }),
            /* @__PURE__ */ jsx6("text", { children: "browser access." })
          ] }),
          /* @__PURE__ */ jsxs4(Row, { marginTop: 1, justifyContent: "center", children: [
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: "gray", children: "[Enter]" }),
            /* @__PURE__ */ jsx6("text", { children: " OK" })
          ] })
        ]
      }
    );
  }
  if (modal.type === "http-disabled-tui") {
    return /* @__PURE__ */ jsxs4(
      ModalContainer,
      {
        screenWidth: width,
        screenHeight: height,
        modalWidth: CONFIG.modal.tuiServerUnavailableWidth,
        borderColor: theme.warning,
        backgroundColor: theme.bg,
        children: [
          /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: theme.warning, children: "Cannot Attach to Session" }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { children: "HTTP server is not enabled for:" }),
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, children: modal.serverName })
          ] }),
          /* @__PURE__ */ jsxs4(Col, { marginTop: 1, children: [
            /* @__PURE__ */ jsx6("text", { children: "OpenCode must be configured or started" }),
            /* @__PURE__ */ jsx6("text", { children: "with HTTP server enabled to attach" }),
            /* @__PURE__ */ jsx6("text", { children: "to sessions." })
          ] }),
          /* @__PURE__ */ jsxs4(Row, { marginTop: 1, justifyContent: "center", children: [
            /* @__PURE__ */ jsx6("text", { style: { attributes: TextAttributes4.BOLD }, fg: "gray", children: "[Enter]" }),
            /* @__PURE__ */ jsx6("text", { children: " OK" })
          ] })
        ]
      }
    );
  }
  return null;
}

// src/app.tsx
import { jsx as jsx7, jsxs as jsxs5 } from "@opentui/react/jsx-runtime";
function consumePendingLaunchRequest() {
  return useUIStore.getState().consumePendingLaunchRequest();
}
function App({
  notificationsEnabled = true,
  initialSessionId,
  wsPort = CONFIG.ws.port,
  theme = DEFAULT_THEME,
  onExit
}) {
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const width = dimensions.width;
  const height = dimensions.height;
  const servers = useSessionStore((s) => s.servers);
  const sessions = useSessionStore((s) => s.sessions);
  const selectedId = useUIStore((s) => s.selectedId);
  const setSelectedId = useUIStore((s) => s.setSelectedId);
  const scrollOffset = useUIStore((s) => s.scrollOffset);
  const setScrollOffset = useUIStore((s) => s.setScrollOffset);
  const browserModal = useUIStore((s) => s.browserModal);
  const detailedSession = useUIStore((s) => s.detailedSession);
  const setDetailedSession = useUIStore((s) => s.setDetailedSession);
  const collapsedServers = useUIStore((s) => s.collapsedServers);
  const setCollapsedServers = useUIStore((s) => s.setCollapsedServers);
  const exit = useCallback(() => {
    if (onExit) {
      onExit();
    } else {
      renderer.destroy();
    }
  }, [onExit, renderer]);
  const cached = loadCache();
  const hasInitializedCollapsedRef = useRef4(false);
  useEffect5(() => {
    if (!hasInitializedCollapsedRef.current && cached?.collapsedServers) {
      setCollapsedServers(cached.collapsedServers);
      hasInitializedCollapsedRef.current = true;
    }
  }, [cached?.collapsedServers, setCollapsedServers]);
  useWebSocket({
    port: wsPort,
    notificationsEnabled,
    initialServers: cached?.servers,
    initialSessions: cached?.sessions
  });
  useSessionPolling();
  const hasInitialSelectedRef = useRef4(false);
  const allSessions = Array.from(sessions.values());
  const groupedByServer = /* @__PURE__ */ new Map();
  for (const session of allSessions) {
    const list = groupedByServer.get(session.serverId) || [];
    list.push(session);
    groupedByServer.set(session.serverId, list);
  }
  const nodesByServer = /* @__PURE__ */ new Map();
  for (const [serverId, serverSessions] of groupedByServer) {
    const currentTree = filterToCurrentSessionTree(serverSessions);
    const nodes = buildSessionNodes(currentTree);
    nodesByServer.set(serverId, nodes);
  }
  const sortedGroups = Array.from(nodesByServer.entries()).sort((a, b) => {
    const serverA = servers.get(a[0]);
    const serverB = servers.get(b[0]);
    return (serverA?.name || "").localeCompare(serverB?.name || "");
  });
  const flatItems = [];
  for (const [serverId, nodes] of sortedGroups) {
    flatItems.push({ type: "group", serverId });
    if (!collapsedServers.has(serverId)) {
      for (const node of nodes) {
        flatItems.push({ type: "session", node });
      }
    }
  }
  const contentHeight = useMemo2(() => Math.max(1, height - 9), [height]);
  const selectedIndex = useMemo2(() => {
    if (flatItems.length === 0) return 0;
    if (selectedId) {
      const idx = flatItems.findIndex((item) => getItemId(item) === selectedId);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [flatItems, selectedId]);
  useEffect5(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + contentHeight) {
      setScrollOffset(selectedIndex - contentHeight + 1);
    }
  }, [selectedIndex, scrollOffset, contentHeight, setScrollOffset]);
  const selectedSessionId = useMemo2(() => {
    const item = flatItems[selectedIndex];
    if (!item || item.type !== "session") return null;
    return item.node.session.id;
  }, [flatItems, selectedIndex]);
  useEffect5(() => {
    if (!selectedSessionId) {
      setDetailedSession(null);
      return;
    }
    const targetSession = sessions.get(selectedSessionId);
    if (!targetSession) return;
    const { originalId, id: compositeId, serverId } = targetSession;
    const wsClient = useConnectionStore.getState().wsClients.get(serverId);
    if (!wsClient) return;
    fetchSessionDetailsWS(wsClient, serverId, originalId).then((details) => {
      if (!useConnectionStore.getState().wsClients.has(serverId)) return;
      if (details) {
        setDetailedSession(details);
        useSessionStore.getState().updateSession(compositeId, details);
      }
    }).catch((err) => {
      debug(
        `[App] Failed to fetch session details: ${extractErrorMessage(err)}`
      );
    });
  }, [selectedSessionId, sessions, setDetailedSession]);
  useEffect5(() => {
    if (!initialSessionId || hasInitialSelectedRef.current) return;
    const item = flatItems.find(
      (item2) => item2.type === "session" && item2.node.session.originalId === initialSessionId
    );
    if (item) {
      setSelectedId(getItemId(item));
      hasInitialSelectedRef.current = true;
    }
  }, [initialSessionId, flatItems, setSelectedId]);
  const setPendingLaunchRequest = useUIStore((s) => s.setPendingLaunchRequest);
  useKeyboardNavigation({
    flatItems,
    selectedIndex,
    contentHeight,
    onExit: exit,
    onLaunchTUI: (request) => {
      setPendingLaunchRequest(request);
      exit();
    }
  });
  const detailsPanelWidth = 42;
  const listWidth = width - detailsPanelWidth;
  const visibleItems = flatItems.slice(
    scrollOffset,
    scrollOffset + contentHeight
  );
  return /* @__PURE__ */ jsxs5(Col, { width, height, ...getThemedBoxProps(theme), children: [
    /* @__PURE__ */ jsxs5(
      Row,
      {
        border: true,
        borderStyle: "single",
        borderColor: theme.primary,
        paddingLeft: 1,
        paddingRight: 1,
        flexShrink: 0,
        ...getThemedBoxProps(theme),
        children: [
          /* @__PURE__ */ jsx7(
            "text",
            {
              style: { attributes: TextAttributes5.BOLD },
              ...getThemedTextProps(theme),
              children: "OpenCode Session Monitor"
            }
          ),
          /* @__PURE__ */ jsx7("text", { style: { attributes: TextAttributes5.DIM }, fg: theme.textMuted, children: ` | Servers: ${servers.size} | Sessions: ${flatItems.filter((i) => i.type === "session").length}/${sessions.size}` })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(
      Row,
      {
        flexGrow: 1,
        flexShrink: 1,
        overflow: "hidden",
        ...getThemedBoxProps(theme),
        children: [
          /* @__PURE__ */ jsx7(
            SessionList,
            {
              visibleItems,
              scrollOffset,
              selectedIndex,
              listWidth,
              totalItems: flatItems.length,
              servers,
              nodesByServer,
              collapsedServers,
              theme
            }
          ),
          /* @__PURE__ */ jsxs5(
            Col,
            {
              width: detailsPanelWidth,
              border: true,
              borderStyle: "single",
              borderColor: theme.border,
              paddingLeft: 1,
              paddingRight: 1,
              flexShrink: 0,
              ...getThemedBoxProps(theme),
              children: [
                /* @__PURE__ */ jsx7(
                  "text",
                  {
                    style: { attributes: TextAttributes5.BOLD },
                    ...getThemedTextProps(theme),
                    children: flatItems[selectedIndex]?.type === "group" ? "Server Details" : "Session Details"
                  }
                ),
                flatItems[selectedIndex]?.type === "session" ? (() => {
                  const item = flatItems[selectedIndex];
                  const basicSession = item.node.session;
                  const session = detailedSession?.originalId === basicSession.originalId && detailedSession?.serverId === basicSession.serverId ? { ...basicSession, ...detailedSession } : basicSession;
                  const server = servers.get(session.serverId);
                  return /* @__PURE__ */ jsx7(
                    SessionDetails,
                    {
                      session,
                      server,
                      panelWidth: detailsPanelWidth,
                      nodesByServer,
                      theme
                    }
                  );
                })() : flatItems[selectedIndex]?.type === "group" ? (() => {
                  const item = flatItems[selectedIndex];
                  const server = servers.get(item.serverId);
                  if (!server) return null;
                  const serverSessions = Array.from(sessions.values()).filter(
                    (s) => s.serverId === item.serverId
                  );
                  return /* @__PURE__ */ jsx7(
                    ServerDetails,
                    {
                      server,
                      serverSessions,
                      panelWidth: detailsPanelWidth,
                      theme
                    }
                  );
                })() : null
              ]
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(
      Row,
      {
        border: true,
        borderStyle: "single",
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        flexShrink: 0,
        justifyContent: "space-between",
        ...getThemedBoxProps(theme),
        children: [
          /* @__PURE__ */ jsx7("text", { style: { attributes: TextAttributes5.DIM }, fg: theme.textMuted, children: "q:quit | t:tui | b:browser | space:toggle | c:toggle all | g/G:top/end" }),
          /* @__PURE__ */ jsx7("text", { style: { attributes: TextAttributes5.DIM }, fg: theme.textMuted, children: getVersionString() })
        ]
      }
    ),
    /* @__PURE__ */ jsx7(
      BrowserModal,
      {
        modal: browserModal,
        width,
        height,
        theme
      }
    )
  ] });
}

// src/components/ErrorBoundary.tsx
import { Component } from "react";
import { TextAttributes as TextAttributes6 } from "@opentui/core";
import { useKeyboard as useKeyboard2 } from "@opentui/react";
import { jsx as jsx8, jsxs as jsxs6 } from "@opentui/react/jsx-runtime";
function ErrorDisplay({
  error,
  onExit
}) {
  useKeyboard2((event) => {
    if (event.name === "q" || event.name === "q" && event.shift) {
      if (onExit) {
        onExit();
      } else {
        process.exit(1);
      }
    }
    if (event.name === "c" && event.ctrl) {
      if (onExit) {
        onExit();
      } else {
        process.exit(1);
      }
    }
  });
  const errorMessage = error?.message || "Unknown error";
  return /* @__PURE__ */ jsxs6(Col, { padding: 1, children: [
    /* @__PURE__ */ jsx8("text", { style: { attributes: TextAttributes6.BOLD }, fg: "red", children: "Something went wrong" }),
    /* @__PURE__ */ jsxs6(Row, { marginTop: 1, children: [
      /* @__PURE__ */ jsx8("text", { fg: "yellow", children: "Error: " }),
      /* @__PURE__ */ jsx8("text", { children: errorMessage })
    ] }),
    /* @__PURE__ */ jsx8(Row, { marginTop: 1, children: /* @__PURE__ */ jsx8("text", { style: { attributes: TextAttributes6.DIM }, children: "Check the debug log for details. Press q to quit." }) })
  ] });
}
var ErrorBoundary = class extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    debug(`[ErrorBoundary] Caught error: ${error.message}`);
    debug(`[ErrorBoundary] Stack: ${error.stack}`);
    debug(`[ErrorBoundary] Component stack: ${errorInfo.componentStack}`);
    if (error.message.includes("TextNodeRenderable")) {
      debug(`[ErrorBoundary] TextNodeRenderable error detected`);
      debug(
        `[ErrorBoundary] This usually means a non-string value was passed to a <text> element`
      );
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenTUI JSX types require any return
  render() {
    if (this.state.hasError) {
      return /* @__PURE__ */ jsx8(ErrorDisplay, { error: this.state.error, onExit: this.props.onExit });
    }
    return this.props.children;
  }
};

// src/index.tsx
import { jsx as jsx9 } from "@opentui/react/jsx-runtime";
var INNER_FLAG = "--inner";
var HELP_TEXT = `
${APP_NAME} - OpenCode Session Monitor

Usage: ${APP_NAME} [options]

Options:
  -h, --help          Show this help message
  -v, --version       Show version number
  --install-plugin    Install the OpenCode plugin
  --uninstall-plugin  Remove the OpenCode plugin
  --no-notify         Disable desktop notifications
  --ws-port <port>    WebSocket server port (default: ${CONFIG.ws.port})
  --theme <name>      Load theme from ~/.config/oc-mon/themes/<name>.toml
  --debug             Enable debug logging (see OPENCODE_MONITOR_LOG_FILE)

Theme Config:
  ~/.config/oc-mon/config.toml         Set theme = "gruvbox"
  ~/.config/oc-mon/themes/<name>.toml  Define custom theme tokens

Keyboard Controls:
  up/down, j/k        Navigate sessions
  PgUp/PgDn           Jump one page
  G                   Jump to last session
  Enter, t            Attach to session in OpenCode TUI
  b                   Open session in browser
  q                   Quit

Environment Variables (for OpenCode plugin):
  OPENCODE_MONITOR_HOST   Monitor host to connect to (default: 127.0.0.1)
  OPENCODE_MONITOR_PORT   WebSocket port (default: ${CONFIG.ws.port})
  OPENCODE_MONITOR_TOKEN  Shared token for monitor authentication (optional)

For more information, see: https://github.com/actualyze-ai/opencode-monitor
`.trim();
var PLUGIN_FILENAME = "opencode-monitor.js";
var OPENCODE_PLUGIN_DIR = join4(homedir3(), ".config", "opencode", "plugin");
function getPluginSourcePath() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  const pluginPath = join4(
    currentDir,
    "..",
    "opencode",
    "plugin",
    PLUGIN_FILENAME
  );
  if (existsSync2(pluginPath)) {
    return pluginPath;
  }
  const globalPluginPath = join4(
    currentDir,
    "opencode",
    "plugin",
    PLUGIN_FILENAME
  );
  if (existsSync2(globalPluginPath)) {
    return globalPluginPath;
  }
  throw new Error(
    `Plugin file not found. Looked in:
  - ${pluginPath}
  - ${globalPluginPath}`
  );
}
function installPlugin() {
  const sourcePath = getPluginSourcePath();
  const destPath = join4(OPENCODE_PLUGIN_DIR, PLUGIN_FILENAME);
  if (!existsSync2(OPENCODE_PLUGIN_DIR)) {
    mkdirSync2(OPENCODE_PLUGIN_DIR, { recursive: true });
    console.log(`Created directory: ${OPENCODE_PLUGIN_DIR}`);
  }
  copyFileSync(sourcePath, destPath);
  console.log(`Plugin installed to: ${destPath}`);
  console.log(
    "\nThe plugin will be loaded automatically when OpenCode starts."
  );
  console.log(
    "Make sure to set OPENCODE_MONITOR_HOST if running on a different machine."
  );
}
function uninstallPlugin() {
  const destPath = join4(OPENCODE_PLUGIN_DIR, PLUGIN_FILENAME);
  if (existsSync2(destPath)) {
    unlinkSync(destPath);
    console.log(`Plugin removed from: ${destPath}`);
  } else {
    console.log(`Plugin not found at: ${destPath}`);
  }
}
function runController(userArgs) {
  const scriptPath = process.argv[1];
  const nodeExecutable = process.argv[0];
  if (!scriptPath || !nodeExecutable) {
    console.error("Could not determine script path or node executable");
    process.exit(1);
  }
  let currentArgs = [INNER_FLAG, ...userArgs];
  const env = { ...process.env };
  while (true) {
    delete env[ENV_VARS.relaunchSession];
    const result = spawnSync(nodeExecutable, [scriptPath, ...currentArgs], {
      stdio: "inherit",
      env
    });
    const exitCode = result.status ?? 1;
    if (exitCode === CONFIG.lifecycle.relaunchExitCode) {
      const newSessionId = process.env[ENV_VARS.relaunchSession];
      if (newSessionId) {
        const filteredArgs = userArgs.filter((arg, i, arr) => {
          if (arg === "--select-session") return false;
          if (i > 0 && arr[i - 1] === "--select-session") return false;
          return true;
        });
        currentArgs = [
          INNER_FLAG,
          "--select-session",
          newSessionId,
          ...filteredArgs
        ];
      }
      continue;
    }
    process.exit(exitCode);
  }
}
async function runTUI(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(getVersionString());
    process.exit(0);
  }
  const theme = resolveTheme({ cliTheme: parseThemeFlag(args) });
  const consoleLogPath = process.env[ENV_VARS.consoleLog] || join4(tmpdir3(), "monitor.log");
  const logStream = createWriteStream(consoleLogPath, { flags: "a" });
  console.log = (...args2) => logStream.write(args2.join(" ") + "\n");
  console.error = (...args2) => logStream.write(args2.join(" ") + "\n");
  console.warn = (...args2) => logStream.write(args2.join(" ") + "\n");
  const notificationsEnabled = !args.includes("--no-notify");
  const wsPortIndex = args.indexOf("--ws-port");
  const wsPortArg = wsPortIndex !== -1 ? args[wsPortIndex + 1] : void 0;
  const wsPort = wsPortArg ? parseInt(wsPortArg, 10) : parseInt(process.env[ENV_VARS.monitorPort] ?? String(CONFIG.ws.port), 10);
  const selectSessionIndex = args.indexOf("--select-session");
  const initialSessionId = selectSessionIndex !== -1 ? args[selectSessionIndex + 1] : void 0;
  const renderer = await createCliRenderer({
    exitOnCtrlC: false
  });
  renderer.setTerminalTitle(APP_NAME);
  const root = createRoot(renderer);
  let exitRequested = false;
  const handleExit = () => {
    exitRequested = true;
    root.unmount();
    renderer.destroy();
  };
  root.render(
    // @ts-expect-error - ErrorBoundary class component type mismatch with OpenTUI JSX types
    /* @__PURE__ */ jsx9(ErrorBoundary, { onExit: handleExit, children: /* @__PURE__ */ jsx9(
      App,
      {
        notificationsEnabled,
        initialSessionId,
        wsPort,
        theme,
        onExit: handleExit
      }
    ) })
  );
  await new Promise((resolve) => {
    const checkExit = setInterval(() => {
      if (exitRequested) {
        clearInterval(checkExit);
        resolve();
      }
    }, 100);
  });
  const launchRequest = consumePendingLaunchRequest();
  if (!launchRequest) {
    process.exit(0);
  }
  console.log(`
Launching OpenCode for session: ${launchRequest.sessionName}`);
  console.log(`Server: ${launchRequest.serverUrl}`);
  console.log(`Session ID: ${launchRequest.sessionId}
`);
  const result = spawnSync(
    "opencode",
    ["attach", launchRequest.serverUrl, "--session", launchRequest.sessionId],
    {
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" }
    }
  );
  if (result.error) {
    console.error(`
Failed to launch OpenCode: ${result.error.message}`);
    process.exit(1);
  }
  process.env[ENV_VARS.relaunchSession] = launchRequest.sessionId;
  process.exit(CONFIG.lifecycle.relaunchExitCode);
}
async function main() {
  process.title = APP_NAME;
  const args = process.argv.slice(2);
  const isInner = args.includes(INNER_FLAG);
  if (isInner) {
    const innerArgs = args.filter((a) => a !== INNER_FLAG);
    await runTUI(innerArgs);
  } else {
    if (args.includes("--help") || args.includes("-h")) {
      console.log(HELP_TEXT);
      process.exit(0);
    }
    if (args.includes("--version") || args.includes("-v")) {
      console.log(getVersionString());
      process.exit(0);
    }
    if (args.includes("--install-plugin")) {
      try {
        installPlugin();
        process.exit(0);
      } catch (err) {
        console.error(
          `Failed to install plugin: ${err instanceof Error ? err.message : err}`
        );
        process.exit(1);
      }
    }
    if (args.includes("--uninstall-plugin")) {
      try {
        uninstallPlugin();
        process.exit(0);
      } catch (err) {
        console.error(
          `Failed to uninstall plugin: ${err instanceof Error ? err.message : err}`
        );
        process.exit(1);
      }
    }
    runController(args);
  }
}
main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
//# sourceMappingURL=index.js.map