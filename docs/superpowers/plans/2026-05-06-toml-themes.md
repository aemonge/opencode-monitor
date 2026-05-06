# TOML Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PR-ready TOML-based theme selection for `oc-mon` via `--theme <name>` and `~/.config/oc-mon/config.toml`.

**Architecture:** Keep the default palette internal and add a focused theme module that parses flat TOML string assignments, resolves config/theme paths under `~/.config/oc-mon`, and merges loaded theme tokens over the default theme. Pass the resolved theme from the CLI entrypoint into React components and replace hardcoded palette colors where the initial feature needs visible coverage.

**Tech Stack:** Bun, TypeScript, React/OpenTUI, Bun test runner. No TOML dependency for first pass; only flat `key = "value"` string TOML is supported.

---

## File Structure

- Create: `src/themes/index.ts` — theme token types, default/gruvbox data, flat TOML parser, config directory helpers, config/theme file loading, theme resolution.
- Create: `src/themes/__tests__/themes.test.ts` — TDD tests for parser, default behavior, config theme, CLI theme precedence, unknown theme errors, config dir creation.
- Modify: `src/index.tsx` — parse `--theme`, resolve theme before renderer startup, pass theme into `App`, update help.
- Modify: `src/app.tsx` — accept `theme` prop and use it for header/details/footer/list/modal boundaries.
- Modify: `src/components/SessionList.tsx` — accept theme prop and use token colors for rows/status/context text.
- Modify as needed: `src/components/SessionDetails.tsx`, `src/components/ServerDetails.tsx`, `src/components/BrowserModal.tsx`, `src/components/Spinner.tsx`, `src/lib/format.ts` — thread theme through enough UI seams to remove core hardcoded palette usage without a broad refactor.
- Modify: `README.md` — document TOML config, theme directory, theme file shape, and `--theme`.

## Tasks

### Task 1: Theme module tests and implementation

- [ ] Write failing tests in `src/themes/__tests__/themes.test.ts` for:
  - parsing flat TOML string values including `text-muted` → `textMuted` normalization
  - rejecting unsupported/malformed TOML lines with a clear error
  - resolving default theme when no config/CLI theme is set
  - loading `~/.config/oc-mon/config.toml` with `theme = "gruvbox"`
  - CLI theme taking precedence over config theme
  - unknown themes listing looked-up path and available themes
  - ensuring `~/.config/oc-mon/themes` is created when resolving config paths
- [ ] Run `bun test src/themes/__tests__/themes.test.ts` and verify RED.
- [ ] Implement `src/themes/index.ts` with `Theme`, `ThemeName`, `ThemeToken`, `DEFAULT_THEME`, `GRUVBOX_THEME`, `parseFlatToml`, `loadMonitorConfig`, `resolveTheme`, and clear `ThemeError` messages.
- [ ] Run `bun test src/themes/__tests__/themes.test.ts` and verify GREEN.

### Task 2: CLI integration

- [ ] Add tests or extend existing entrypoint seams where practical for CLI parsing helpers.
- [ ] Extract `--theme` parsing into a small exported helper from `src/index.tsx` or theme module.
- [ ] Resolve theme before `createCliRenderer`, so unknown theme errors print to the real terminal before log redirection.
- [ ] Pass `theme` into `<App theme={theme} />`.
- [ ] Update `HELP_TEXT` with `--theme <name>` and config paths.
- [ ] Run focused tests and typecheck.

### Task 3: Apply theme to TUI colors

- [ ] Update `AppProps` with `theme?: Theme`, defaulting to `DEFAULT_THEME`.
- [ ] Replace app-level hardcoded border colors with `theme.primary` / `theme.border`.
- [ ] Pass `theme` to `SessionList`, `SessionDetails`, `ServerDetails`, and `BrowserModal` as needed.
- [ ] Update `SessionList` to use theme tokens for selected background, dim text, primary server rows, status success/warning/error, and context usage colors.
- [ ] Preserve default behavior by making default token values match existing palette as closely as possible.
- [ ] Run component/lib tests and typecheck.

### Task 4: Documentation and final validation

- [ ] Update `README.md` TUI options and config reference with `~/.config/oc-mon/config.toml` and `~/.config/oc-mon/themes/<name>.toml`.
- [ ] Include gruvbox example TOML.
- [ ] Run `bun run typecheck`, `bun run lint`, `bun run format:check`, and `bun test`.
- [ ] Stop and report any failing check before fixing.

## Self-Review

- Spec coverage: TOML-only config, named themes, default/gruvbox, no color override flags, config dir creation, README/help covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: theme token names use camelCase internally and support kebab-case TOML aliases for `text-muted`.
