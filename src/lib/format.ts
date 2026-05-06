// Data formatting utilities

import type { Theme } from "../themes";

/**
 * Get color associated with session status
 * @param status - Session status string
 * @returns Color name for terminal display
 */
export function getStatusColor(status: string, theme?: Theme): string {
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

/**
 * Format timestamp to human readable string.
 * Uses relative time for recent activity, compact absolute for older.
 * All formats fit within 12 characters for consistent alignment.
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string (e.g., "5s ago", "Dec 26 10:24a")
 */
export function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;

  // Relative time for very recent (< 1 hour)
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;

  // For older timestamps, use compact format: "Dec 26 10:24"
  const date = new Date(timestamp);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const hour12 = hours % 12 || 12;
  const ampm = hours < 12 ? "a" : "p";

  return `${month} ${day} ${hour12}:${minutes}${ampm}`;
}

/**
 * Format context usage with percentage
 * @param used - Tokens used
 * @param limit - Token limit
 * @returns Formatted string like "150k (75%)" or "150k" if no limit
 */
export function formatContextUsage(used?: number, limit?: number): string {
  if (!used) return "";

  const usedStr = used >= 1000 ? `${Math.round(used / 1000)}k` : `${used}`;

  if (!limit || limit === 0) return usedStr;

  const percentage = Math.round((used / limit) * 100);
  return `${usedStr} (${percentage}%)`;
}

/**
 * Get color for context usage based on percentage
 * @param used - Tokens used
 * @param limit - Token limit
 * @returns Hex color code for terminal display
 */
export function getContextUsageColor(
  used?: number,
  limit?: number,
  theme?: Theme,
): string {
  if (!used || !limit || limit === 0) return theme?.textMuted ?? "#666666";

  const ratio = used / limit;
  if (ratio > 0.8) return theme?.error ?? "#ff6b6b"; // red - high usage
  if (ratio > 0.5) return theme?.warning ?? "#ffd93d"; // yellow - medium usage
  return theme?.success ?? "#6bcf7f"; // green - low usage
}
