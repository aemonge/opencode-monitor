// Session list component with server groups and session rows

import { TextAttributes } from "@opentui/core";
import {
  formatTimestamp,
  formatContextUsage,
  getStatusColor,
  getContextUsageColor,
} from "../lib/format";
import { truncateText } from "../lib/text";
import Spinner from "./Spinner";
import { Row, Col } from "./primitives";
import { getSelectedTextColor, getThemedBoxProps } from "../themes";
import type { Theme } from "../themes";
import type { Session, SessionNode, Server, ListItem } from "../types";

interface SessionListProps {
  visibleItems: ListItem[];
  scrollOffset: number;
  selectedIndex: number;
  listWidth: number;
  totalItems: number;
  servers: Map<string, Server>;
  nodesByServer: Map<string, SessionNode[]>;
  collapsedServers: Set<string>;
  theme: Theme;
}

function renderSessionName(
  name: string,
  maxWidth: number,
  isSelected: boolean,
  theme: Theme,
): React.ReactNode {
  const safeName = name || "";
  const subagentMatch = safeName.match(
    /^(.+?)\s*\(@(\w+(?:-\w+)*)\s+subagent\)$/,
  );

  if (subagentMatch) {
    const mainName = subagentMatch[1] || "";
    const agentType = subagentMatch[2] || "";
    const suffix = ` @${agentType}`;
    const availableForMain = maxWidth - suffix.length;
    const truncatedMain = truncateText(mainName, availableForMain);

    return (
      <>
        <text
          style={{
            attributes: isSelected ? TextAttributes.BOLD : TextAttributes.NONE,
          }}
          fg={isSelected ? getSelectedTextColor(theme) : theme.text}
        >
          {truncatedMain}
        </text>
        <text fg={isSelected ? theme.text : theme.textMuted}>{suffix}</text>
      </>
    );
  }

  return (
    <text
      style={{
        attributes: isSelected ? TextAttributes.BOLD : TextAttributes.NONE,
      }}
      fg={isSelected ? getSelectedTextColor(theme) : theme.text}
    >
      {truncateText(safeName, maxWidth)}
    </text>
  );
}

function SessionStatus({
  session,
  isPending,
  isSelected,
  theme,
}: {
  session: Session;
  isPending: boolean;
  isSelected: boolean;
  theme: Theme;
}): React.ReactNode {
  const dimColor = theme.textMuted;

  if (isPending) {
    return <text fg={dimColor}>○</text>;
  }

  if (session.status === "busy" || session.status === "retry") {
    return <Spinner isBusy={true} theme={theme} />;
  }

  if (session.status === "waiting_for_permission") {
    return (
      <text style={{ attributes: TextAttributes.BOLD }} fg={theme.warning}>
        ◉
      </text>
    );
  }

  if (session.status === "idle") {
    return (
      <text fg={isSelected ? getSelectedTextColor(theme) : theme.success}>
        ●
      </text>
    );
  }

  if (session.status === "completed") {
    return (
      <text fg={isSelected ? getSelectedTextColor(theme) : theme.textMuted}>
        ○
      </text>
    );
  }

  if (session.status === "error" || session.status === "aborted") {
    return (
      <text fg={isSelected ? getSelectedTextColor(theme) : theme.error}>✕</text>
    );
  }

  return (
    <text
      fg={
        isSelected
          ? getSelectedTextColor(theme)
          : getStatusColor(session.status, theme)
      }
    >
      ●
    </text>
  );
}

function ServerGroupRow({
  serverId,
  server,
  nodeCount,
  isSelected,
  isCollapsed,
  theme,
}: {
  serverId: string;
  server: Server | undefined;
  nodeCount: number;
  isSelected: boolean;
  isCollapsed: boolean;
  theme: Theme;
}): React.ReactNode {
  const serverName = server?.name || serverId;
  const isPending = server?.pending === true;
  const indicator = isCollapsed ? "▶" : "▼";

  return (
    <Row
      key={`group-${serverId}`}
      backgroundColor={isSelected ? theme.surface : theme.bg}
      paddingLeft={1}
      paddingRight={1}
    >
      <text
        style={{ attributes: TextAttributes.BOLD }}
        fg={
          isSelected
            ? getSelectedTextColor(theme)
            : isPending
              ? theme.textMuted
              : theme.primary
        }
      >
        {`${indicator} ${serverName} (${nodeCount})`}
      </text>
    </Row>
  );
}

function SessionRow({
  node,
  server,
  isSelected,
  listWidth,
  theme,
}: {
  node: SessionNode;
  server: Server | undefined;
  isSelected: boolean;
  listWidth: number;
  theme: Theme;
}): React.ReactNode {
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
    listWidth - statusW - timeW - tokensW - contextW - treePrefixWidth - 2,
  );

  return (
    <Row
      key={`session-${session.id}`}
      {...(isSelected ? { backgroundColor: theme.surface } : {})}
      paddingLeft={1}
      paddingRight={1}
    >
      {node.treePrefix ? (
        <text fg={isSelected ? theme.text : dimColor}>{node.treePrefix}</text>
      ) : null}

      <Row width={statusW}>
        <SessionStatus
          session={session}
          isPending={isPending}
          isSelected={isSelected}
          theme={theme}
        />
      </Row>

      <Row width={nameW}>
        {isPending ? (
          <text fg={dimColor}>{truncateText(session.name || "", nameW)}</text>
        ) : (
          renderSessionName(session.name || "", nameW, isSelected, theme)
        )}
      </Row>

      <Row width={contextW} justifyContent="flex-end" paddingRight={1}>
        <text
          fg={
            isPending
              ? dimColor
              : isSelected
                ? theme.text
                : getContextUsageColor(
                    session.contextUsed,
                    session.contextLimit,
                    theme,
                  )
          }
        >
          {formatContextUsage(session.contextUsed, session.contextLimit)}
        </text>
      </Row>

      <Row width={tokensW} justifyContent="flex-end" paddingRight={1}>
        <text
          fg={isPending ? dimColor : isSelected ? theme.text : theme.textMuted}
        >
          {session.tokens !== undefined && session.tokens >= 1000
            ? `${Math.round(session.tokens / 1000)}k`
            : session.tokens !== undefined
              ? String(session.tokens)
              : ""}
        </text>
      </Row>

      <Row width={timeW} justifyContent="flex-end">
        <text
          fg={isPending ? dimColor : isSelected ? theme.text : theme.textMuted}
        >
          {formatTimestamp(session.lastActivity)}
        </text>
      </Row>
    </Row>
  );
}

export function SessionList({
  visibleItems,
  scrollOffset,
  selectedIndex,
  listWidth,
  totalItems,
  servers,
  nodesByServer,
  collapsedServers,
  theme,
}: SessionListProps): React.ReactNode {
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + visibleItems.length < totalItems;
  const moreAboveCount = scrollOffset;
  const moreBelowCount = totalItems - scrollOffset - visibleItems.length;

  if (servers.size === 0) {
    return (
      <Col width={listWidth} flexGrow={1} {...getThemedBoxProps(theme)}>
        <Col
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          {...getThemedBoxProps(theme)}
        >
          <text style={{ attributes: TextAttributes.DIM }} fg={theme.textMuted}>
            {"Waiting for OpenCode servers..."}
          </text>
        </Col>
      </Col>
    );
  }

  return (
    <Col width={listWidth} flexGrow={1} {...getThemedBoxProps(theme)}>
      {/* Scroll indicator - more above */}
      {hasMoreAbove ? (
        <Row justifyContent="center" {...getThemedBoxProps(theme)}>
          <text fg={theme.primary}>{`▲ ${moreAboveCount} more above`}</text>
        </Row>
      ) : null}

      {visibleItems.map((item, visibleIdx) => {
        const absoluteIdx = scrollOffset + visibleIdx;
        const isSelected = absoluteIdx === selectedIndex;

        if (item.type === "group") {
          const server = servers.get(item.serverId);
          const groupNodes = nodesByServer.get(item.serverId) || [];
          const isCollapsed = collapsedServers.has(item.serverId);
          return (
            <ServerGroupRow
              key={`group-${item.serverId}`}
              serverId={item.serverId}
              server={server}
              nodeCount={groupNodes.length}
              isSelected={isSelected}
              isCollapsed={isCollapsed}
              theme={theme}
            />
          );
        }

        const server = servers.get(item.node.session.serverId);
        return (
          <SessionRow
            key={`session-${item.node.session.id}`}
            node={item.node}
            server={server}
            isSelected={isSelected}
            listWidth={listWidth}
            theme={theme}
          />
        );
      })}

      {/* Spacer to push "more below" to bottom */}
      <Col flexGrow={1} {...getThemedBoxProps(theme)} />

      {/* Scroll indicator - more below */}
      {hasMoreBelow ? (
        <Row justifyContent="center" {...getThemedBoxProps(theme)}>
          <text fg={theme.primary}>{`▼ ${moreBelowCount} more below`}</text>
        </Row>
      ) : null}
    </Col>
  );
}
