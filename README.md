# OpenCode Monitor

> **📌 Fork install note**: While the upstream PR is pending acceptance, install this
> fork directly via:
>
> ```bash
> bun remove -g @actualyze/opencode-monitor
> rm -rf ~/.bun/install/cache/@actualyze/opencode-monitor*
> bun add -g github:aemonge/opencode-monitor
> oc-mon --install-plugin
> ```

**Keep track of all your OpenCode sessions in one place.** Monitor dozens of AI coding
sessions across multiple machines, get instant desktop notifications when tasks complete
or need approval, and jump into any session with a single keystroke.

![Version](https://img.shields.io/badge/version-1.0.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.0-f472b6)

## Why Use This?

When you're running multiple OpenCode sessions—whether it's parallel feature
development, code reviews, or background tasks—it's easy to lose track of what's
happening. This monitor gives you:

- **Single dashboard** for all sessions across all machines
- **Desktop notifications** when sessions finish or need permission approval
- **One-key access** to attach to any session or open it in your browser
- **Real-time status** with visual indicators (spinning for busy, color-coded states)
- **Token and cost tracking** to monitor API usage across sessions

```
┌─ Sessions ─────────────────────────┬─ Details ──────────────────────────┐
│ ▼ my-laptop-12345 (2 sessions)     │ Session: implement-feature         │
│   ● implement-feature         idle │ Status:  idle                       │
│   ◐ @code-review             busy │ Server:  my-laptop-12345            │
│                                    │ Model:   anthropic/claude-sonnet   │
│ ▼ dev-server-67890 (1 session)     │                                    │
│   ◉ fix-bug     waiting_for_perm.. │ Tokens                             │
│                                    │   Input:    12,450                 │
│                                    │   Output:    3,200                 │
│                                    │   Cache:     8,100 read            │
│                                    │                                    │
│                                    │ Context: 45% ████████░░░░░░░░░░░░  │
│                                    │ Cost:    $0.0234                   │
│                                    │ Messages: 8                        │
│                                    │                                    │
│                                    │ Location                           │
│                                    │   ~/projects/my-app                │
│                                    │   Branch: feature/auth             │
└────────────────────────────────────┴────────────────────────────────────┘
 q:quit | t:tui | b:browser | space:toggle | c:toggle all | g/G:top/end
```

## Features

- **Multi-server monitoring** — Track sessions across multiple machines from one
  terminal
- **Desktop notifications** — Get notified when sessions complete or need permission
  approval
- **Instant session access** — Press `t` to attach or `b` to open in browser
- **Hierarchical view** — See parent sessions and their subagents in a tree structure
- **Collapsible groups** — Organize sessions by server, collapse groups you don't need
- **Live status updates** — Real-time status via WebSocket with visual spinners for busy
  sessions
- **Token & cost tracking** — Monitor input/output tokens, cache usage, and cumulative
  costs
- **Context warnings** — Color-coded context usage (green/yellow/red) to prevent
  overflows

### Session Details Panel

- **Token breakdown**: Input, output, reasoning, cache read/write
- **Context usage**: With percentage and color-coded warnings (green/yellow/red)
- **Cost tracking**: Cumulative across all messages
- **Model info**: Provider and model identification
- **Message count**: Total user + assistant messages
- **Hierarchy**: Parent/children relationships
- **Location**: Project, branch, and directory

### User Interface

- Full-screen terminal UI with responsive two-pane layout
- Session list with details panel side-by-side
- Keyboard navigation (arrows, j/k, page up/down, G)
- Visual status indicators with spinner animation for busy sessions
- Grouped sessions by server with visual headers
- Subagent label formatting (`@agent-type` suffix)

### Session Actions

- Press `Enter` or `t` to attach to session (launches `opencode attach`)
- Press `b` to open session in web browser
- Press `Space` to collapse/expand server groups
- Auto-return to monitor after OpenCode exits

> **Important**: The `t` (attach) and `b` (browser) actions require OpenCode to be
> running with its HTTP server enabled. See
> [OpenCode Server Mode](#opencode-server-mode) for configuration details.

## Quick Start

### Install from npm (Recommended)

```bash
# Install globally (choose one)
npm install -g @actualyze/opencode-monitor
# or: bun add -g @actualyze/opencode-monitor

# Install the OpenCode plugin (REQUIRED)
oc-mon --install-plugin

# Start monitoring
oc-mon
```

> **Note**: To attach to sessions or open them in browser, OpenCode must be running with
> its HTTP server enabled. See [OpenCode Server Mode](#opencode-server-mode) below.

### Install from source

```bash
git clone https://github.com/actualyze-ai/opencode-monitor.git
cd opencode-monitor
bun install
bun run build
bun run install-plugin
bun start
```

## OpenCode Server Mode

**⚠️ Critical**: OpenCode now defaults to running **without** an HTTP server. The `t`
(attach) and `b` (browser) actions require OpenCode's HTTP server to be enabled.

### Enabling the HTTP Server

Add this to your OpenCode configuration (`~/.config/opencode/config.json`):

```json
{
  "server": {
    "hostname": "localhost"
  }
}
```

> **Why `localhost`?** OpenCode only starts the HTTP server when the hostname differs
> from the default (`127.0.0.1`). Using `localhost` triggers the server while still
> binding to the loopback interface. See
> [anomalyco/opencode#8562](https://github.com/anomalyco/opencode/pull/8562) for a
> cleaner `server.enabled` option (pending merge).

### Alternative: Environment Variable

You can also enable the server via environment variable:

```bash
export OPENCODE_HTTP_ENABLED=true
opencode
```

### Verifying Server Mode

When OpenCode starts with the HTTP server enabled, you'll see a message like:

```
HTTP server listening on http://localhost:54321
```

If you don't see this message, the `t` and `b` keys in the monitor will show a "Server
Unavailable" error.

---

## Plugin Installation

**⚠️ Required**: The monitor requires a plugin installed in each OpenCode instance.

### Install Commands

```bash
# Copy plugin to OpenCode config
bun run install-plugin

# Or symlink for development (auto-updates on rebuild)
bun run link-plugin

# Remove plugin
bun run uninstall-plugin
```

### Plugin Configuration

Set these environment variables where OpenCode runs:

```bash
# Monitor host(s) - comma-separated for multiple
export OPENCODE_MONITOR_HOST=127.0.0.1
export OPENCODE_MONITOR_HOST=192.168.1.50,10.0.0.5  # Multiple hosts

# WebSocket port (default: 41235)
export OPENCODE_MONITOR_PORT=41235

# Shared token for monitor authentication (optional)
export OPENCODE_MONITOR_TOKEN=your-shared-token

# Full URL override for this OpenCode server (optional)
# Use for HTTPS, custom domains, or complex routing
export OPENCODE_SERVER_URL=https://myserver.com:8443

# Server host to advertise (default: auto-detect from WebSocket connection)
# Set this when the TUI runs on a different machine
export OPENCODE_SERVER_HOST=192.168.1.100

# Server port override (default: auto-detect via lsof)
# Use when behind NAT/port forwarding where external port differs from internal
export OPENCODE_SERVER_PORT=8080

# Enable debug logging
export OPENCODE_MONITOR_DEBUG=1
```

**Docker/Container Note**: Set `OPENCODE_MONITOR_HOST` to your desktop's IP address so
the plugin can reach the monitor.

### Remote Monitoring Setup

When running the TUI on a different machine than OpenCode:

**Automatic IP Detection (Default)**

By default, the TUI automatically detects the OpenCode server's IP from the WebSocket
connection. Just set `OPENCODE_MONITOR_HOST` to point to your TUI machine:

```bash
export OPENCODE_MONITOR_HOST=192.168.1.50  # TUI host's IP
opencode
```

The TUI will use the source IP of the incoming WebSocket connection to construct the
server URL for attach/browser functionality.

**Explicit Server Host (Override)**

If automatic detection doesn't work (e.g., NAT, complex routing), explicitly set the
server's IP:

```bash
export OPENCODE_SERVER_HOST=192.168.1.100  # OpenCode host's IP
export OPENCODE_MONITOR_HOST=192.168.1.50  # TUI host's IP
opencode
```

**Local-Only Mode**

To force local-only connections (disable remote access):

```bash
export OPENCODE_SERVER_HOST=127.0.0.1
opencode
```

## Security

### Auth token (recommended)

Set `OPENCODE_MONITOR_TOKEN` to require a shared token for WebSocket connections. The
value must match in both the TUI environment and the OpenCode plugin environment.

Generate a token once (on any machine), then copy the value:

```bash
OPENCODE_MONITOR_TOKEN="$(openssl rand -hex 32)"
echo "$OPENCODE_MONITOR_TOKEN"
```

Set the same value for the TUI and each OpenCode plugin environment:

```bash
export OPENCODE_MONITOR_TOKEN="<paste-token-here>"
```

### Security considerations (full disclosure)

- WebSocket traffic is plaintext (no TLS).
- Auth is a shared secret only; anyone with the token can connect.
- If the port is exposed, a hostile client could connect, proxy SDK calls, or send fake
  events.
- The plugin runs with the OpenCode process permissions; treat connected machines as
  trusted.
- Session metadata is cached on disk; protect `OPENCODE_MONITOR_CACHE_FILE` on shared
  hosts.
- Browser URLs are built from server metadata; avoid connecting to untrusted servers.

### Recommended hardening

- Keep the server on localhost or a trusted LAN.
- Use firewall rules or SSH tunneling; do not expose the port publicly.
- Rotate the token if you share it or suspect exposure.

## Usage

### Keyboard Navigation

| Key           | Action                       |
| ------------- | ---------------------------- |
| `↑` / `k`     | Move selection up            |
| `↓` / `j`     | Move selection down          |
| `Page Up`     | Jump up one page             |
| `Page Down`   | Jump down one page           |
| `g`           | Jump to first item           |
| `G`           | Jump to last item            |
| `Enter` / `t` | Open session in OpenCode TUI |
| `b`           | Open session in web browser  |
| `Space`       | Toggle server group collapse |
| `c`           | Toggle all server groups     |
| `q`           | Quit                         |

### Debug Mode

```bash
# Enable debug logging
bun start -- --debug

# Logs written to $TMPDIR/opencode-monitor-debug.log
```

## Session States

| State                    | Indicator   | Description                    |
| ------------------------ | ----------- | ------------------------------ |
| `idle`                   | ● (green)   | Session loaded, not processing |
| `busy`                   | ◐ (spinner) | Actively executing             |
| `retry`                  | ◐ (magenta) | Retrying after error           |
| `waiting_for_permission` | ◉ (yellow)  | Needs user approval            |
| `completed`              | ○ (gray)    | Finished                       |
| `error` / `aborted`      | ✕ (red)     | Failed or cancelled            |

## Configuration Reference

### Plugin Environment Variables

| Variable                   | Default                       | Description                                                                     |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `OPENCODE_MONITOR_HOST`    | `127.0.0.1`                   | Monitor host(s), comma-separated                                                |
| `OPENCODE_MONITOR_PORT`    | `41235`                       | WebSocket port                                                                  |
| `OPENCODE_MONITOR_TOKEN`   | -                             | Shared token for monitor authentication                                         |
| `OPENCODE_SERVER_URL`      | -                             | Full URL override for OpenCode server (e.g., `https://myserver.com:8443`)       |
| `OPENCODE_SERVER_HOST`     | `auto`                        | Server IP to advertise. `auto` = TUI detects from connection                    |
| `OPENCODE_SERVER_PORT`     | `auto`                        | Server port to advertise. `auto` = detect via lsof. Use for NAT/port forwarding |
| `OPENCODE_MONITOR_DEBUG`   | -                             | Set to `1` for debug logging                                                    |
| `OPENCODE_PLUGIN_LOG_FILE` | `$TMPDIR/opencode-plugin.log` | Plugin log file path                                                            |

### TUI Options

| Option             | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| `--debug`          | Enable debug logging (see `OPENCODE_MONITOR_LOG_FILE`)       |
| `--no-notify`      | Disable desktop notifications                                |
| `--theme <name>`   | Load `~/.config/oc-mon/themes/<name>.toml` or built-in theme |
| `--ws-port <port>` | WebSocket server port (default: 41235)                       |

### TUI Theme Configuration

`oc-mon` uses its default palette unless a theme is selected by CLI or config. The
config directory is created automatically at `~/.config/oc-mon`.

```bash
# Use the built-in gruvbox theme, or a matching user theme file
oc-mon --theme gruvbox
```

Set a persistent theme in `~/.config/oc-mon/config.toml`:

```toml
theme = "gruvbox"
```

Custom themes live in `~/.config/oc-mon/themes/<name>.toml` and use flat string token
assignments:

```toml
bg = "#f2e5bc"
surface = "#ebdbb2"
text = "#3c3836"
text-muted = "#7c6f64"
primary = "#b57614"
border = "#d5c4a1"
error = "#9d0006"
warning = "#af3a03"
success = "#79740e"
```

CLI `--theme <name>` overrides the config file. First-pass theme files support only flat
`key = "value"` TOML entries.

### TUI Environment Variables

| Variable                       | Default                               | Description                                 |
| ------------------------------ | ------------------------------------- | ------------------------------------------- |
| `OPENCODE_MONITOR_DEBUG`       | -                                     | Set to `1` to enable debug logging          |
| `OPENCODE_MONITOR_LOG_FILE`    | `$TMPDIR/opencode-monitor-debug.log`  | Debug log file path                         |
| `OPENCODE_MONITOR_CONSOLE_LOG` | `$TMPDIR/monitor.log`                 | Console redirect log                        |
| `OPENCODE_MONITOR_CACHE_FILE`  | `$TMPDIR/opencode-monitor-cache.json` | Session cache file                          |
| `OPENCODE_MONITOR_PORT`        | `41235`                               | WebSocket server port (same as `--ws-port`) |
| `OPENCODE_MONITOR_TOKEN`       | -                                     | Shared token for authentication             |

## Troubleshooting

### Attach (t) or Browser (b) shows "Server Unavailable"

This means OpenCode is running without its HTTP server enabled.

**Solution**: Enable the HTTP server in OpenCode:

```json
// ~/.config/opencode/config.json
{
  "server": {
    "hostname": "localhost"
  }
}
```

Or via environment variable:

```bash
export OPENCODE_HTTP_ENABLED=true
opencode
```

See [OpenCode Server Mode](#opencode-server-mode) for details.

### No servers discovered

1. Verify plugin is installed: `ls ~/.config/opencode/plugin/`
2. Check `OPENCODE_MONITOR_HOST` is set correctly in OpenCode environment
3. Verify WebSocket port 41235 is not blocked by firewall
4. Check plugin logs: `tail -f $TMPDIR/opencode-plugin.log`

### Wrong server shown in details

- Fixed in v0.1.0: Now uses composite IDs for unique session identification across
  servers

### High CPU usage

- Fixed in v0.1.0: Reduced API calls from ~880/30s to ~68/30s via heartbeat optimization

### Debug logging

```bash
# Monitor debug log
tail -f /tmp/opencode-monitor-debug.log

# Plugin debug log
tail -f /tmp/opencode-plugin.log

# Or use $TMPDIR for cross-platform paths
tail -f $TMPDIR/opencode-monitor-debug.log
tail -f $TMPDIR/opencode-plugin.log
```

## Requirements

- Bun 1.0+ (runtime and test runner)
- Terminal with color support (256 colors recommended)
- OpenCode instances with the monitor plugin installed

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture details,
testing guidelines, and code standards.
