/**
 * Version string utilities.
 *
 * The version string is injected at build time by tsup.
 * Format: "${APP_NAME} v0.1.0" or "${APP_NAME} v0.1.0-b6379d" (dev)
 */

import { APP_NAME } from "./config";

// Declare the build-time injected constant
declare const __VERSION_STRING__: string;

function getInjectedVersionString(): string | undefined {
  return typeof __VERSION_STRING__ === "string"
    ? __VERSION_STRING__
    : undefined;
}

/**
 * Get the full version string for display.
 * Example: "oc-mon v0.1.0" or "oc-mon v0.1.0-b6379d"
 */
export function getVersionString(): string {
  return getInjectedVersionString() ?? `${APP_NAME} v0.0.0-dev`;
}

/**
 * Get just the version number (for --version flag compatibility).
 * Example: "0.1.0" or "0.1.0-b6379d"
 */
export function getVersion(): string {
  return getVersionString().replace(new RegExp(`^${APP_NAME} v`), "");
}
