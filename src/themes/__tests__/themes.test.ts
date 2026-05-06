import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_THEME,
  GRUVBOX_THEME,
  getMonitorConfigDir,
  parseFlatToml,
  parseThemeFlag,
  resolveTheme,
} from "../index";

function createConfigHome(): string {
  return mkdtempSync(join(tmpdir(), "oc-mon-theme-test-"));
}

describe("parseFlatToml", () => {
  it("parses flat string assignments and normalizes kebab-case tokens", () => {
    expect(
      parseFlatToml(`
        bg = "#282828"
        text-muted = "#928374"
        primary = "goldenrod"
      `),
    ).toEqual({
      bg: "#282828",
      textMuted: "#928374",
      primary: "goldenrod",
    });
  });

  it("rejects unsupported TOML lines with a clear error", () => {
    expect(() => parseFlatToml("[theme]")).toThrow(
      'Unsupported TOML line 1: [theme]. Expected key = "value".',
    );
  });
});

describe("resolveTheme", () => {
  it("returns the default theme when no config or CLI theme is set", () => {
    const configHome = createConfigHome();

    expect(resolveTheme({ configHome })).toEqual(DEFAULT_THEME);
  });

  it("loads the theme selected by config.toml", () => {
    const configHome = createConfigHome();
    const configDir = getMonitorConfigDir(configHome);
    writeFileSync(join(configDir, "config.toml"), 'theme = "gruvbox"\n');

    expect(resolveTheme({ configHome })).toEqual(GRUVBOX_THEME);
  });

  it("uses CLI theme instead of config theme", () => {
    const configHome = createConfigHome();
    const configDir = getMonitorConfigDir(configHome);
    writeFileSync(join(configDir, "config.toml"), 'theme = "default"\n');

    expect(resolveTheme({ configHome, cliTheme: "gruvbox" })).toEqual(
      GRUVBOX_THEME,
    );
  });

  it("loads user theme files from the config themes directory", () => {
    const configHome = createConfigHome();
    const configDir = getMonitorConfigDir(configHome);
    writeFileSync(
      join(configDir, "themes", "custom.toml"),
      'primary = "#01696f"\ntext-muted = "#cdccca"\n',
    );

    expect(resolveTheme({ configHome, cliTheme: "custom" })).toEqual({
      ...DEFAULT_THEME,
      name: "custom",
      primary: "#01696f",
      textMuted: "#cdccca",
    });
  });

  it("reports unknown themes with looked-up path and available names", () => {
    const configHome = createConfigHome();
    const configDir = getMonitorConfigDir(configHome);
    writeFileSync(
      join(configDir, "themes", "custom.toml"),
      'primary = "red"\n',
    );

    expect(() => resolveTheme({ configHome, cliTheme: "missing" })).toThrow(
      `Unknown theme "missing".\n\nLooked for:\n- ${join(
        configDir,
        "themes",
        "missing.toml",
      )}\n\nAvailable themes:\n- custom\n- default\n- gruvbox`,
    );
  });
});

describe("parseThemeFlag", () => {
  it("returns the theme name after --theme", () => {
    expect(parseThemeFlag(["--ws-port", "41235", "--theme", "gruvbox"])).toBe(
      "gruvbox",
    );
  });

  it("throws a clear error when --theme has no value", () => {
    expect(() => parseThemeFlag(["--theme"])).toThrow(
      "Missing value for --theme.",
    );
  });
});
