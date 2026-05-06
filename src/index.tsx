#!/usr/bin/env bun

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import App, { consumePendingLaunchRequest } from "./app";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { APP_NAME, CONFIG, ENV_VARS } from "./lib/config";
import { getVersionString } from "./lib/version";
import { parseThemeFlag, resolveTheme } from "./themes";

const INNER_FLAG = "--inner";

const HELP_TEXT = `
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

const PLUGIN_FILENAME = "opencode-monitor.js";
const OPENCODE_PLUGIN_DIR = join(homedir(), ".config", "opencode", "plugin");

/**
 * Get the path to the bundled plugin file.
 * Works both in development (src/) and when installed from npm (dist/).
 */
function getPluginSourcePath(): string {
  // Get the directory of the current module
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // When running from dist/, plugin is at ../opencode/plugin/
  // When running from src/, plugin is at ../opencode/plugin/
  const pluginPath = join(
    currentDir,
    "..",
    "opencode",
    "plugin",
    PLUGIN_FILENAME,
  );

  if (existsSync(pluginPath)) {
    return pluginPath;
  }

  // Fallback: try relative to package root (for global installs)
  const globalPluginPath = join(
    currentDir,
    "opencode",
    "plugin",
    PLUGIN_FILENAME,
  );
  if (existsSync(globalPluginPath)) {
    return globalPluginPath;
  }

  throw new Error(
    `Plugin file not found. Looked in:\n  - ${pluginPath}\n  - ${globalPluginPath}`,
  );
}

function installPlugin(): void {
  const sourcePath = getPluginSourcePath();
  const destPath = join(OPENCODE_PLUGIN_DIR, PLUGIN_FILENAME);

  // Create plugin directory if it doesn't exist
  if (!existsSync(OPENCODE_PLUGIN_DIR)) {
    mkdirSync(OPENCODE_PLUGIN_DIR, { recursive: true });
    console.log(`Created directory: ${OPENCODE_PLUGIN_DIR}`);
  }

  // Copy plugin file
  copyFileSync(sourcePath, destPath);
  console.log(`Plugin installed to: ${destPath}`);
  console.log(
    "\nThe plugin will be loaded automatically when OpenCode starts.",
  );
  console.log(
    "Make sure to set OPENCODE_MONITOR_HOST if running on a different machine.",
  );
}

function uninstallPlugin(): void {
  const destPath = join(OPENCODE_PLUGIN_DIR, PLUGIN_FILENAME);

  if (existsSync(destPath)) {
    unlinkSync(destPath);
    console.log(`Plugin removed from: ${destPath}`);
  } else {
    console.log(`Plugin not found at: ${destPath}`);
  }
}

function runController(userArgs: string[]): never {
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
      env,
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
          ...filteredArgs,
        ];
      }

      continue;
    }

    process.exit(exitCode);
  }
}

async function runTUI(args: string[]): Promise<never> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(getVersionString());
    process.exit(0);
  }

  const theme = resolveTheme({ cliTheme: parseThemeFlag(args) });

  const consoleLogPath =
    process.env[ENV_VARS.consoleLog] || join(tmpdir(), "monitor.log");
  const logStream = createWriteStream(consoleLogPath, { flags: "a" });
  console.log = (...args) => logStream.write(args.join(" ") + "\n");
  console.error = (...args) => logStream.write(args.join(" ") + "\n");
  console.warn = (...args) => logStream.write(args.join(" ") + "\n");

  const notificationsEnabled = !args.includes("--no-notify");

  const wsPortIndex = args.indexOf("--ws-port");
  const wsPortArg = wsPortIndex !== -1 ? args[wsPortIndex + 1] : undefined;
  const wsPort = wsPortArg
    ? parseInt(wsPortArg, 10)
    : parseInt(process.env[ENV_VARS.monitorPort] ?? String(CONFIG.ws.port), 10);

  const selectSessionIndex = args.indexOf("--select-session");
  const initialSessionId =
    selectSessionIndex !== -1 ? args[selectSessionIndex + 1] : undefined;

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  // Set terminal tab title (process.title only affects ps listings, not the tab)
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
    <ErrorBoundary onExit={handleExit}>
      <App
        notificationsEnabled={notificationsEnabled}
        initialSessionId={initialSessionId}
        wsPort={wsPort}
        theme={theme}
        onExit={handleExit}
      />
    </ErrorBoundary>,
  );

  await new Promise<void>((resolve) => {
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

  console.log(`\nLaunching OpenCode for session: ${launchRequest.sessionName}`);
  console.log(`Server: ${launchRequest.serverUrl}`);
  console.log(`Session ID: ${launchRequest.sessionId}\n`);

  const result = spawnSync(
    "opencode",
    ["attach", launchRequest.serverUrl, "--session", launchRequest.sessionId],
    {
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" },
    },
  );

  if (result.error) {
    console.error(`\nFailed to launch OpenCode: ${result.error.message}`);
    process.exit(1);
  }

  process.env[ENV_VARS.relaunchSession] = launchRequest.sessionId;
  process.exit(CONFIG.lifecycle.relaunchExitCode);
}

async function main(): Promise<void> {
  // Set terminal title to app name (instead of "bun")
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
          `Failed to install plugin: ${err instanceof Error ? err.message : err}`,
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
          `Failed to uninstall plugin: ${err instanceof Error ? err.message : err}`,
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
