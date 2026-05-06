import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Theme {
  name: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  border: string;
  error: string;
  warning: string;
  success: string;
}

type ThemeOverrides = Partial<Omit<Theme, "name">>;

const THEME_KEYS = new Set([
  "bg",
  "surface",
  "text",
  "textMuted",
  "primary",
  "border",
  "error",
  "warning",
  "success",
]);

export const DEFAULT_THEME: Theme = {
  name: "default",
  bg: "#1a1a1a",
  surface: "#264f78",
  text: "#cccccc",
  textMuted: "#666666",
  primary: "blue",
  border: "#666666",
  error: "red",
  warning: "yellow",
  success: "green",
};

export const GRUVBOX_THEME: Theme = {
  name: "gruvbox",
  bg: "#f2e5bc",
  surface: "#ebdbb2",
  text: "#3c3836",
  textMuted: "#7c6f64",
  primary: "#b57614",
  border: "#d5c4a1",
  error: "#9d0006",
  warning: "#af3a03",
  success: "#79740e",
};

const BUILT_IN_THEMES: Record<string, Theme> = {
  default: DEFAULT_THEME,
  gruvbox: GRUVBOX_THEME,
};

interface MonitorConfig {
  theme?: string;
}

export interface ResolveThemeOptions {
  cliTheme?: string | undefined;
  configHome?: string | undefined;
}

export function getThemedTextProps(theme: Theme): { fg: string } {
  return { fg: theme.text };
}

export function getThemedBoxProps(theme: Theme): { backgroundColor: string } {
  return { backgroundColor: theme.bg };
}

export function getSelectedTextColor(theme: Theme): string {
  return theme.text;
}

function normalizeKey(key: string): string {
  return key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

export function parseFlatToml(input: string): Record<string, string> {
  const values: Record<string, string> = {};

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;

    const match = line.match(
      /^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"\s*(?:#.*)?$/,
    );
    if (!match?.[1] || match[2] === undefined) {
      throw new Error(
        `Unsupported TOML line ${index + 1}: ${line}. Expected key = "value".`,
      );
    }

    values[normalizeKey(match[1])] = match[2];
  });

  return values;
}

export function parseThemeFlag(args: string[]): string | undefined {
  const themeIndex = args.indexOf("--theme");
  if (themeIndex === -1) return undefined;

  const theme = args[themeIndex + 1];
  if (!theme || theme.startsWith("--")) {
    throw new Error("Missing value for --theme.");
  }

  return theme;
}

export function getMonitorConfigDir(configHome = join(homedir(), ".config")) {
  const configDir = join(configHome, "oc-mon");
  mkdirSync(join(configDir, "themes"), { recursive: true });
  return configDir;
}

function getThemesDir(configHome?: string): string {
  return join(getMonitorConfigDir(configHome), "themes");
}

function parseMonitorConfig(path: string): MonitorConfig {
  const values = parseFlatToml(readFileSync(path, "utf8"));
  const theme = values.theme;
  return theme ? { theme } : {};
}

function getConfigTheme(configHome?: string): string | undefined {
  const configPath = join(getMonitorConfigDir(configHome), "config.toml");
  if (!existsSync(configPath)) return undefined;
  return parseMonitorConfig(configPath).theme;
}

function listUserThemes(configHome?: string): string[] {
  const themesDir = getThemesDir(configHome);
  if (!existsSync(themesDir)) return [];

  return readdirSync(themesDir)
    .filter((entry) => entry.endsWith(".toml"))
    .filter((entry) => statSync(join(themesDir, entry)).isFile())
    .map((entry) => entry.replace(/\.toml$/, ""));
}

function parseThemeFile(path: string, name: string): Theme {
  const values = parseFlatToml(readFileSync(path, "utf8"));
  const overrides: ThemeOverrides = {};

  for (const [key, value] of Object.entries(values)) {
    if (key === "theme" || key === "name") continue;
    if (!THEME_KEYS.has(key)) {
      throw new Error(`Unsupported theme token "${key}" in ${path}.`);
    }
    overrides[key as keyof ThemeOverrides] = value;
  }

  return { ...DEFAULT_THEME, ...overrides, name };
}

function loadThemeByName(name: string, configHome?: string): Theme {
  const builtIn = BUILT_IN_THEMES[name];
  if (builtIn) return builtIn;

  const themePath = join(getThemesDir(configHome), `${name}.toml`);
  if (existsSync(themePath)) return parseThemeFile(themePath, name);

  const availableThemes = Array.from(
    new Set([...listUserThemes(configHome), ...Object.keys(BUILT_IN_THEMES)]),
  ).sort();
  const available = availableThemes.length
    ? availableThemes.map((themeName) => `- ${themeName}`).join("\n")
    : "- default\n- gruvbox";

  throw new Error(
    `Unknown theme "${name}".\n\nLooked for:\n- ${themePath}\n\nAvailable themes:\n${available}`,
  );
}

export function resolveTheme(options: ResolveThemeOptions = {}): Theme {
  const selectedTheme = options.cliTheme ?? getConfigTheme(options.configHome);
  if (!selectedTheme) return DEFAULT_THEME;
  return loadThemeByName(selectedTheme, options.configHome);
}
