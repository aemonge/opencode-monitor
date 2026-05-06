// Server details panel component
//
// Displays server-specific information when a server group header is selected.

import React from "react";
import { TextAttributes } from "@opentui/core";
import { Row, Col } from "./primitives";
import { DEFAULT_THEME } from "../themes";
import type { Theme } from "../themes";
import type { Server, Session } from "../types";

interface ServerDetailsProps {
  /** The server to display details for */
  server: Server;
  /** All sessions belonging to this server */
  serverSessions: Session[];
  /** Width of the details panel */
  panelWidth: number;
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
 * Labeled value row - uses <span> for inline styled text
 */
function LabeledValue({
  label,
  value,
  valueColor,
  labelStyle,
  valueStyle,
  theme = DEFAULT_THEME,
}: {
  label: string;
  value: string;
  valueColor?: string;
  labelStyle?: number;
  valueStyle?: number;
  theme?: Theme;
}): React.ReactNode {
  const labelAttrs = labelStyle ?? TextAttributes.BOLD | TextAttributes.DIM;
  const valueAttrs = valueStyle ?? TextAttributes.DIM;

  if (valueColor) {
    return (
      <text>
        <span style={{ attributes: labelAttrs }} fg={theme.textMuted}>
          {label}
        </span>
        <span style={{ attributes: valueAttrs }} fg={valueColor}>
          {value}
        </span>
      </text>
    );
  }

  return (
    <text>
      <span style={{ attributes: labelAttrs }} fg={theme.textMuted}>
        {label}
      </span>
      <span style={{ attributes: valueAttrs }} fg={theme.textMuted}>
        {value}
      </span>
    </text>
  );
}

/**
 * Renders the server details panel
 */
export function ServerDetails({
  server,
  serverSessions,
  panelWidth,
  theme = DEFAULT_THEME,
}: ServerDetailsProps): React.ReactNode {
  const dim = TextAttributes.DIM;
  const dimBold = TextAttributes.BOLD | TextAttributes.DIM;

  // Connection status
  const isConnected = !server.pending;
  const statusStr = isConnected ? "Connected" : "Pending";
  const statusColor = isConnected ? theme.success : theme.warning;

  // Last seen formatting
  const lastSeenStr = new Date(server.lastSeen).toLocaleTimeString();

  // Session statistics
  const totalSessions = serverSessions.length;
  const activeSessions = serverSessions.filter(
    (s) => s.status === "busy" || s.status === "retry",
  ).length;
  const idleSessions = serverSessions.filter((s) => s.status === "idle").length;
  const waitingSessions = serverSessions.filter(
    (s) => s.status === "waiting_for_permission",
  ).length;
  const completedSessions = serverSessions.filter(
    (s) => s.status === "completed",
  ).length;
  const errorSessions = serverSessions.filter(
    (s) => s.status === "error" || s.status === "aborted",
  ).length;

  // Usage totals
  const totalTokens = serverSessions.reduce(
    (sum, s) => sum + (s.tokens || 0),
    0,
  );
  const totalCost = serverSessions.reduce((sum, s) => sum + (s.cost || 0), 0);

  // Format strings
  const serverIdStr = server.id.slice(-8);
  const totalTokensStr = totalTokens > 0 ? totalTokens.toLocaleString() : "";
  const totalCostStr =
    totalCost > 0
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(totalCost)
      : "";

  const showUsage = totalTokensStr !== "" || totalCostStr !== "";

  return (
    <Col marginTop={1}>
      {/* Basic Info */}
      <Row justifyContent="space-between">
        <LabeledValue label="ID: " value={serverIdStr} theme={theme} />
        <LabeledValue
          label="Status: "
          value={statusStr}
          valueColor={statusColor}
          valueStyle={0}
          theme={theme}
        />
      </Row>
      <LabeledValue label="Last seen: " value={lastSeenStr} theme={theme} />

      {/* Sessions Section */}
      <SectionDivider title="Sessions" panelWidth={panelWidth} theme={theme} />
      <Row justifyContent="space-between">
        <LabeledValue
          label="Total: "
          value={String(totalSessions)}
          theme={theme}
        />
        {activeSessions > 0 ? (
          <LabeledValue
            label="Active: "
            value={String(activeSessions)}
            valueColor={theme.primary}
            theme={theme}
          />
        ) : null}
      </Row>
      <Row justifyContent="space-between">
        {idleSessions > 0 ? (
          <LabeledValue
            label="Idle: "
            value={String(idleSessions)}
            valueColor={theme.success}
            theme={theme}
          />
        ) : null}
        {waitingSessions > 0 ? (
          <LabeledValue
            label="Waiting: "
            value={String(waitingSessions)}
            valueColor={theme.warning}
            theme={theme}
          />
        ) : null}
      </Row>
      {completedSessions > 0 || errorSessions > 0 ? (
        <Row justifyContent="space-between">
          {completedSessions > 0 ? (
            <LabeledValue
              label="Completed: "
              value={String(completedSessions)}
              theme={theme}
            />
          ) : null}
          {errorSessions > 0 ? (
            <LabeledValue
              label="Errors: "
              value={String(errorSessions)}
              valueColor={theme.error}
              theme={theme}
            />
          ) : null}
        </Row>
      ) : null}

      {/* Location Section */}
      <SectionDivider title="Location" panelWidth={panelWidth} theme={theme} />
      {server.project ? (
        <LabeledValue label="Project: " value={server.project} theme={theme} />
      ) : null}
      {server.branch ? (
        <LabeledValue label="Branch: " value={server.branch} theme={theme} />
      ) : null}
      {server.url ? (
        server.url === "disabled" ? (
          <Col marginTop={1}>
            <text style={{ attributes: dimBold }} fg={theme.textMuted}>
              {"HTTP Server:"}
            </text>
            <Row paddingLeft={1}>
              <text fg={theme.warning}>Disabled</text>
            </Row>
          </Col>
        ) : (
          <Col marginTop={1}>
            <text style={{ attributes: dimBold }} fg={theme.textMuted}>
              {"URL:"}
            </text>
            <Row paddingLeft={1}>
              <text style={{ attributes: dim }} fg={theme.textMuted}>
                {server.url}
              </text>
            </Row>
          </Col>
        )
      ) : null}

      {/* Usage Section */}
      {showUsage ? (
        <Col>
          <SectionDivider title="Usage" panelWidth={panelWidth} theme={theme} />
          {totalTokensStr !== "" ? (
            <LabeledValue
              label="Total tokens: "
              value={totalTokensStr}
              theme={theme}
            />
          ) : null}
          {totalCostStr !== "" ? (
            <LabeledValue
              label="Total cost: "
              value={totalCostStr}
              theme={theme}
            />
          ) : null}
        </Col>
      ) : null}
    </Col>
  );
}
