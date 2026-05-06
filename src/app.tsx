// OpenCode Session Monitor - Main Application

import { useCallback, useEffect, useMemo, useRef } from "react";
import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions, useRenderer } from "@opentui/react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useSessionPolling } from "./hooks/useSessionPolling";
import {
  useKeyboardNavigation,
  getItemId,
} from "./hooks/useKeyboardNavigation";
import { fetchSessionDetailsWS } from "./lib/http";
import { buildSessionNodes } from "./lib/tree";
import { filterToCurrentSessionTree } from "./lib/session-filter";
import { SessionList } from "./components/SessionList";
import { loadCache } from "./lib/cache";
import { getVersionString } from "./lib/version";
import { SessionDetails } from "./components/SessionDetails";
import { ServerDetails } from "./components/ServerDetails";
import { BrowserModal } from "./components/BrowserModal";
import { Row, Col } from "./components/primitives";
import { CONFIG } from "./lib/config";
import { debug } from "./lib/debug";
import { extractErrorMessage } from "./lib/errors";
import { useSessionStore, useUIStore, useConnectionStore } from "./stores";
import { DEFAULT_THEME, getThemedBoxProps, getThemedTextProps } from "./themes";
import type { Theme } from "./themes";
import type { Session, SessionNode, ListItem } from "./types";

// Re-export store functions for backwards compatibility with index.tsx
export function consumePendingLaunchRequest() {
  return useUIStore.getState().consumePendingLaunchRequest();
}

interface AppProps {
  notificationsEnabled?: boolean;
  initialSessionId?: string | undefined;
  wsPort?: number;
  theme?: Theme;
  onExit?: () => void;
}

export default function App({
  notificationsEnabled = true,
  initialSessionId,
  wsPort = CONFIG.ws.port,
  theme = DEFAULT_THEME,
  onExit,
}: AppProps): React.ReactNode {
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const width = dimensions.width;
  const height = dimensions.height;

  // Zustand stores
  const servers = useSessionStore((s) => s.servers);
  const sessions = useSessionStore((s) => s.sessions);
  const selectedId = useUIStore((s) => s.selectedId);
  const setSelectedId = useUIStore((s) => s.setSelectedId);
  const scrollOffset = useUIStore((s) => s.scrollOffset);
  const setScrollOffset = useUIStore((s) => s.setScrollOffset);
  const browserModal = useUIStore((s) => s.browserModal);
  const detailedSession = useUIStore((s) => s.detailedSession);
  const setDetailedSession = useUIStore((s) => s.setDetailedSession);
  const collapsedServers = useUIStore((s) => s.collapsedServers);
  const setCollapsedServers = useUIStore((s) => s.setCollapsedServers);

  const exit = useCallback(() => {
    if (onExit) {
      onExit();
    } else {
      renderer.destroy();
    }
  }, [onExit, renderer]);

  // Load cached data and initialize WebSocket
  const cached = loadCache();

  // Initialize collapsed servers from cache (only once)
  const hasInitializedCollapsedRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedCollapsedRef.current && cached?.collapsedServers) {
      setCollapsedServers(cached.collapsedServers);
      hasInitializedCollapsedRef.current = true;
    }
  }, [cached?.collapsedServers, setCollapsedServers]);

  useWebSocket({
    port: wsPort,
    notificationsEnabled,
    initialServers: cached?.servers,
    initialSessions: cached?.sessions,
  });

  useSessionPolling();

  // Track if we've done initial selection
  const hasInitialSelectedRef = useRef(false);

  // Build session tree and flat list
  const allSessions = Array.from(sessions.values());
  const groupedByServer = new Map<string, Session[]>();
  for (const session of allSessions) {
    const list = groupedByServer.get(session.serverId) || [];
    list.push(session);
    groupedByServer.set(session.serverId, list);
  }

  const nodesByServer = new Map<string, SessionNode[]>();
  for (const [serverId, serverSessions] of groupedByServer) {
    const currentTree = filterToCurrentSessionTree(serverSessions);
    const nodes = buildSessionNodes(currentTree);
    nodesByServer.set(serverId, nodes);
  }

  const sortedGroups = Array.from(nodesByServer.entries()).sort((a, b) => {
    const serverA = servers.get(a[0]);
    const serverB = servers.get(b[0]);
    return (serverA?.name || "").localeCompare(serverB?.name || "");
  });

  const flatItems: ListItem[] = [];
  for (const [serverId, nodes] of sortedGroups) {
    flatItems.push({ type: "group", serverId });
    // Only add sessions if server is not collapsed
    if (!collapsedServers.has(serverId)) {
      for (const node of nodes) {
        flatItems.push({ type: "session", node });
      }
    }
  }

  // Selection and scrolling
  const contentHeight = useMemo(() => Math.max(1, height - 9), [height]);

  const selectedIndex = useMemo(() => {
    if (flatItems.length === 0) return 0;

    if (selectedId) {
      const idx = flatItems.findIndex((item) => getItemId(item) === selectedId);
      if (idx >= 0) return idx;
    }

    // Default to first item (could be group or session)
    return 0;
  }, [flatItems, selectedId]);

  // Auto-scroll to keep selection visible
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + contentHeight) {
      setScrollOffset(selectedIndex - contentHeight + 1);
    }
  }, [selectedIndex, scrollOffset, contentHeight, setScrollOffset]);

  // Fetch detailed session data
  const selectedSessionId = useMemo(() => {
    const item = flatItems[selectedIndex];
    if (!item || item.type !== "session") return null;
    return item.node.session.id;
  }, [flatItems, selectedIndex]);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetailedSession(null);
      return;
    }

    const targetSession = sessions.get(selectedSessionId);
    if (!targetSession) return;

    const { originalId, id: compositeId, serverId } = targetSession;
    const wsClient = useConnectionStore.getState().wsClients.get(serverId);
    if (!wsClient) return;

    fetchSessionDetailsWS(wsClient, serverId, originalId)
      .then((details: Session | null) => {
        if (!useConnectionStore.getState().wsClients.has(serverId)) return;
        if (details) {
          setDetailedSession(details);
          useSessionStore.getState().updateSession(compositeId, details);
        }
      })
      .catch((err: unknown) => {
        debug(
          `[App] Failed to fetch session details: ${extractErrorMessage(err)}`,
        );
      });
  }, [selectedSessionId, sessions, setDetailedSession]);

  // Auto-select session if specified (returning from TUI)
  useEffect(() => {
    if (!initialSessionId || hasInitialSelectedRef.current) return;

    const item = flatItems.find(
      (item) =>
        item.type === "session" &&
        item.node.session.originalId === initialSessionId,
    );

    if (item) {
      setSelectedId(getItemId(item));
      hasInitialSelectedRef.current = true;
    }
  }, [initialSessionId, flatItems, setSelectedId]);

  const setPendingLaunchRequest = useUIStore((s) => s.setPendingLaunchRequest);

  // Keyboard navigation
  useKeyboardNavigation({
    flatItems,
    selectedIndex,
    contentHeight,
    onExit: exit,
    onLaunchTUI: (request) => {
      setPendingLaunchRequest(request);
      exit();
    },
  });

  // Render
  const detailsPanelWidth = 42;
  const listWidth = width - detailsPanelWidth;
  const visibleItems = flatItems.slice(
    scrollOffset,
    scrollOffset + contentHeight,
  );

  return (
    <Col width={width} height={height} {...getThemedBoxProps(theme)}>
      {/* Header */}
      <Row
        border={true}
        borderStyle="single"
        borderColor={theme.primary}
        paddingLeft={1}
        paddingRight={1}
        flexShrink={0}
        {...getThemedBoxProps(theme)}
      >
        <text
          style={{ attributes: TextAttributes.BOLD }}
          {...getThemedTextProps(theme)}
        >
          OpenCode Session Monitor
        </text>
        <text style={{ attributes: TextAttributes.DIM }} fg={theme.textMuted}>
          {` | Servers: ${servers.size} | Sessions: ${flatItems.filter((i) => i.type === "session").length}/${sessions.size}`}
        </text>
      </Row>

      {/* Main content */}
      <Row
        flexGrow={1}
        flexShrink={1}
        overflow="hidden"
        {...getThemedBoxProps(theme)}
      >
        {/* Session list */}
        <SessionList
          visibleItems={visibleItems}
          scrollOffset={scrollOffset}
          selectedIndex={selectedIndex}
          listWidth={listWidth}
          totalItems={flatItems.length}
          servers={servers}
          nodesByServer={nodesByServer}
          collapsedServers={collapsedServers}
          theme={theme}
        />

        {/* Details panel */}
        <Col
          width={detailsPanelWidth}
          border={true}
          borderStyle="single"
          borderColor={theme.border}
          paddingLeft={1}
          paddingRight={1}
          flexShrink={0}
          {...getThemedBoxProps(theme)}
        >
          <text
            style={{ attributes: TextAttributes.BOLD }}
            {...getThemedTextProps(theme)}
          >
            {flatItems[selectedIndex]?.type === "group"
              ? "Server Details"
              : "Session Details"}
          </text>
          {flatItems[selectedIndex]?.type === "session"
            ? (() => {
                const item = flatItems[selectedIndex] as {
                  type: "session";
                  node: SessionNode;
                };
                const basicSession = item.node.session;
                const session =
                  detailedSession?.originalId === basicSession.originalId &&
                  detailedSession?.serverId === basicSession.serverId
                    ? { ...basicSession, ...detailedSession }
                    : basicSession;
                const server = servers.get(session.serverId);

                return (
                  <SessionDetails
                    session={session}
                    server={server}
                    panelWidth={detailsPanelWidth}
                    nodesByServer={nodesByServer}
                    theme={theme}
                  />
                );
              })()
            : flatItems[selectedIndex]?.type === "group"
              ? (() => {
                  const item = flatItems[selectedIndex] as {
                    type: "group";
                    serverId: string;
                  };
                  const server = servers.get(item.serverId);
                  if (!server) return null;

                  // Get all sessions for this server
                  const serverSessions = Array.from(sessions.values()).filter(
                    (s) => s.serverId === item.serverId,
                  );

                  return (
                    <ServerDetails
                      server={server}
                      serverSessions={serverSessions}
                      panelWidth={detailsPanelWidth}
                      theme={theme}
                    />
                  );
                })()
              : null}
        </Col>
      </Row>

      {/* Footer */}
      <Row
        border={true}
        borderStyle="single"
        borderColor={theme.border}
        paddingLeft={1}
        paddingRight={1}
        flexShrink={0}
        justifyContent="space-between"
        {...getThemedBoxProps(theme)}
      >
        <text style={{ attributes: TextAttributes.DIM }} fg={theme.textMuted}>
          {
            "q:quit | t:tui | b:browser | space:toggle | c:toggle all | g/G:top/end"
          }
        </text>
        <text style={{ attributes: TextAttributes.DIM }} fg={theme.textMuted}>
          {getVersionString()}
        </text>
      </Row>

      {/* Browser warning modals */}
      <BrowserModal
        modal={browserModal}
        width={width}
        height={height}
        theme={theme}
      />
    </Col>
  );
}
