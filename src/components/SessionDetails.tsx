// Session details panel component
//
// OpenTUI Text Element Rules:
// 1. <text> cannot nest inside <text> - use <span> for inline styled content
// 2. Valid children of <text>: strings, <span>, <b>, <i>, <u>, <a>, <br>
// 3. Use ternary operators (? : null) instead of && to avoid passing `false`

import React, { useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { getStatusColor, getContextUsageColor } from "../lib/format";
import { truncateText } from "../lib/text";
import { Row, Col } from "./primitives";
import { DEFAULT_THEME } from "../themes";
import type { Theme } from "../themes";
import type { Server, Session, SessionNode } from "../types";

interface SessionDetailsProps {
  /** The session to display details for */
  session: Session;
  /** Server the session belongs to */
  server: Server | undefined;
  /** Width of the details panel */
  panelWidth: number;
  /** Session nodes for calculating child count */
  nodesByServer: Map<string, SessionNode[]>;
  /** Resolved UI theme */
  theme?: Theme;
}

/**
 * Section divider with title
 */
function SectionDivider({
  title,
  panelWidth,
  theme,
}: {
  title: string;
  panelWidth: number;
  theme: Theme;
}): React.ReactNode {
  const dividerLine = "─".repeat(Math.max(0, panelWidth - title.length - 7));
  return (
    <Row marginTop={1}>
      <text fg={theme.textMuted}>{`── ${title} `}</text>
      <text fg={theme.border}>{dividerLine}</text>
    </Row>
  );
}

/**
 * Format directory path, abbreviating home directory
 */
function formatDirectory(dir: string): string {
  const home = process.env.HOME || "";
  if (home && dir.startsWith(home)) {
    return "~" + dir.slice(home.length);
  }
  return dir;
}

/**
 * Labeled value row - uses <span> for inline styled text
 * NOTE: OpenTUI does NOT allow <text> inside <text>. Use <span> instead.
 */
function LabeledValue({
  label,
  value,
  valueColor,
  labelStyle,
  valueStyle,
}: {
  label: string;
  value: string;
  valueColor?: string;
  labelStyle?: number;
  valueStyle?: number;
}): React.ReactNode {
  const labelAttrs = labelStyle ?? TextAttributes.BOLD | TextAttributes.DIM;
  const valueAttrs = valueStyle ?? TextAttributes.DIM;

  // Use <span> for nested styled content - <text> cannot nest inside <text>
  // Conditionally apply fg only when valueColor is defined
  if (valueColor) {
    return (
      <text>
        <span style={{ attributes: labelAttrs }}>{label}</span>
        <span style={{ attributes: valueAttrs }} fg={valueColor}>
          {value}
        </span>
      </text>
    );
  }

  return (
    <text>
      <span style={{ attributes: labelAttrs }}>{label}</span>
      <span style={{ attributes: valueAttrs }}>{value}</span>
    </text>
  );
}

/**
 * Renders the session details panel
 */
export function SessionDetails({
  session,
  server,
  panelWidth,
  nodesByServer,
  theme = DEFAULT_THEME,
}: SessionDetailsProps): React.ReactNode {
  // Memoize age calculation (changes with createdAt)
  const ageStr = useMemo(() => {
    const age = Date.now() - session.createdAt;
    if (age < 3600000) return `${Math.floor(age / 60000)}m`;
    if (age < 86400000) return `${Math.floor(age / 3600000)}h`;
    return `${Math.floor(age / 86400000)}d`;
  }, [session.createdAt]);

  // Memoize context string (changes with contextUsed/contextLimit)
  const contextStr = useMemo(() => {
    if (!session.contextUsed) return "";
    const used = session.contextUsed.toLocaleString();
    if (session.contextLimit) {
      const pct = Math.round(
        (session.contextUsed / session.contextLimit) * 100,
      );
      return `${used}  ${pct}%`;
    }
    return used;
  }, [session.contextUsed, session.contextLimit]);

  // Memoize cost string (changes with cost)
  const costStr = useMemo(() => {
    if (!session.cost) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(session.cost);
  }, [session.cost]);

  // Memoize child count calculation (expensive filter operation)
  const childCount = useMemo(
    () =>
      (nodesByServer.get(session.serverId) || []).filter(
        (n) => n.session.parentId === session.originalId,
      ).length,
    [nodesByServer, session.serverId, session.originalId],
  );

  const dimBold = TextAttributes.BOLD | TextAttributes.DIM;
  const dim = TextAttributes.DIM;

  // Pre-compute all string values
  const sessionId = (session.originalId || "").slice(-8);
  const statusValue = session.status || "idle";
  const statusColor = getStatusColor(statusValue, theme);
  const messageCountStr =
    session.messageCount !== undefined && session.messageCount > 0
      ? String(session.messageCount)
      : "";
  const contextColor = getContextUsageColor(
    session.contextUsed,
    session.contextLimit,
    theme,
  );
  const modelStr = session.model
    ? `${session.model.provider || "unknown"} / ${session.model.model || "unknown"}`
    : "";
  const statusUpdatedStr =
    session.statusUpdatedAt !== undefined
      ? new Date(session.statusUpdatedAt).toLocaleTimeString()
      : "";
  const projectStr = session.project
    ? truncateText(session.project, panelWidth - 12)
    : "";
  const directoryStr = session.directory
    ? formatDirectory(session.directory)
    : "";
  const serverNameStr = server?.name || "unknown";
  const serverUrlStr = server?.url || "";
  const parentIdStr = session.parentId
    ? (session.parentId || "").slice(-8)
    : "";
  const childCountStr = childCount > 0 ? String(childCount) : "";

  // Token breakdown strings
  const inputStr = session.tokenBreakdown
    ? session.tokenBreakdown.input.toLocaleString().padStart(8)
    : "";
  const outputStr = session.tokenBreakdown
    ? session.tokenBreakdown.output.toLocaleString().padStart(8)
    : "";
  const cacheReadStr = session.tokenBreakdown
    ? session.tokenBreakdown.cacheRead.toLocaleString()
    : "";
  const cacheWriteStr = session.tokenBreakdown
    ? session.tokenBreakdown.cacheWrite.toLocaleString()
    : "";
  const reasoningStr =
    session.tokenBreakdown && session.tokenBreakdown.reasoning > 0
      ? session.tokenBreakdown.reasoning.toLocaleString()
      : "";

  // Conditional flags
  const showUsage = contextStr !== "" || costStr !== "";
  const showTokens = session.tokenBreakdown !== undefined;
  const showModel = modelStr !== "";
  const showHierarchy = parentIdStr !== "" || childCountStr !== "";

  return (
    <Col marginTop={1}>
      {/* Basic Info */}
      <Row justifyContent="space-between">
        <LabeledValue label="ID: " value={sessionId} />
        <LabeledValue
          label="Status: "
          value={statusValue}
          valueColor={statusColor}
          valueStyle={0}
        />
      </Row>
      <Row justifyContent="space-between">
        <LabeledValue label="Age: " value={ageStr} />
        {messageCountStr !== "" ? (
          <LabeledValue label="Messages: " value={messageCountStr} />
        ) : null}
      </Row>

      {/* Usage Section */}
      {showUsage ? (
        <Col>
          <SectionDivider title="Usage" panelWidth={panelWidth} theme={theme} />
          {contextStr !== "" ? (
            <LabeledValue
              label="Context: "
              value={contextStr}
              valueColor={contextColor}
            />
          ) : null}
          {costStr !== "" ? (
            <LabeledValue label="Cost: " value={costStr} />
          ) : null}
        </Col>
      ) : null}

      {/* Tokens Section */}
      {showTokens ? (
        <Col>
          <SectionDivider
            title="Tokens"
            panelWidth={panelWidth}
            theme={theme}
          />
          <Row justifyContent="space-between">
            <LabeledValue label="Input: " value={inputStr} />
            <LabeledValue label="Cache R: " value={cacheReadStr} />
          </Row>
          <Row justifyContent="space-between">
            <LabeledValue label="Output: " value={outputStr} />
            <LabeledValue label="Cache W: " value={cacheWriteStr} />
          </Row>
          {reasoningStr !== "" ? (
            <LabeledValue label="Reasoning: " value={reasoningStr} />
          ) : null}
        </Col>
      ) : null}

      {/* Model Section */}
      {showModel ? (
        <Col>
          <SectionDivider title="Model" panelWidth={panelWidth} theme={theme} />
          <text style={{ attributes: dim }}>{modelStr}</text>
        </Col>
      ) : null}

      {/* Location Section */}
      <SectionDivider title="Location" panelWidth={panelWidth} theme={theme} />
      {statusUpdatedStr !== "" ? (
        <Row marginBottom={1}>
          <LabeledValue label="Status updated: " value={statusUpdatedStr} />
        </Row>
      ) : null}
      {projectStr !== "" ? (
        <LabeledValue label="Project: " value={projectStr} />
      ) : null}
      {directoryStr !== "" ? (
        <Col marginTop={1}>
          <text style={{ attributes: dimBold }}>{"Directory:"}</text>
          <Row paddingLeft={1}>
            <text style={{ attributes: dim }}>{directoryStr}</text>
          </Row>
        </Col>
      ) : null}
      {server ? (
        <Col marginTop={1}>
          {serverUrlStr === "disabled" ? (
            <text>
              <span style={{ attributes: dimBold }}>{"Server: "}</span>
              <span style={{ attributes: dim }}>{serverNameStr}</span>
              <span fg={theme.warning}>{" (HTTP Disabled)"}</span>
            </text>
          ) : (
            <>
              <LabeledValue label="Server: " value={serverNameStr} />
              <Row paddingLeft={1}>
                <text style={{ attributes: dim }}>{serverUrlStr}</text>
              </Row>
            </>
          )}
        </Col>
      ) : null}

      {/* Hierarchy Section */}
      {showHierarchy ? (
        <Col>
          <SectionDivider
            title="Hierarchy"
            panelWidth={panelWidth}
            theme={theme}
          />
          {parentIdStr !== "" ? (
            <LabeledValue label="Parent: " value={parentIdStr} />
          ) : null}
          {childCountStr !== "" ? (
            <LabeledValue label="Children: " value={childCountStr} />
          ) : null}
        </Col>
      ) : null}
    </Col>
  );
}
