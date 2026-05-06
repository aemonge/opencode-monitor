// Modal dialogs for session-related warnings

import React from "react";
import { TextAttributes } from "@opentui/core";
import { truncateText } from "../lib/text";
import { CONFIG } from "../lib/config";
import { Row, Col } from "./primitives";
import { DEFAULT_THEME } from "../themes";
import type { Theme } from "../themes";
import type { BrowserModalState } from "../types";

// Re-export for backwards compatibility
export type { BrowserModalState } from "../types";

interface BrowserModalProps {
  modal: BrowserModalState;
  width: number;
  height: number;
  theme?: Theme;
}

interface ModalContainerProps {
  /** Screen width for centering */
  screenWidth: number;
  /** Screen height for centering */
  screenHeight: number;
  /** Modal width */
  modalWidth: number;
  /** Border color */
  borderColor: string;
  backgroundColor: string;
  /** Modal content */
  children: React.ReactNode;
}

/**
 * Reusable modal container with consistent styling.
 * Centers the modal on screen with rounded border.
 */
function ModalContainer({
  screenWidth,
  screenHeight,
  modalWidth,
  borderColor,
  backgroundColor,
  children,
}: ModalContainerProps): React.ReactNode {
  return (
    <Col
      position="absolute"
      backgroundColor={backgroundColor}
      border={true}
      borderStyle="rounded"
      borderColor={borderColor}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      marginLeft={Math.floor((screenWidth - modalWidth) / 2)}
      marginTop={Math.floor((screenHeight - 10) / 2)}
      width={modalWidth}
    >
      {children}
    </Col>
  );
}

/**
 * Renders warning modals (subagent, browser, and attach errors)
 */
export function BrowserModal({
  modal,
  width,
  height,
  theme = DEFAULT_THEME,
}: BrowserModalProps): React.ReactNode {
  if (!modal) return null;

  if (modal.type === "subagent") {
    return (
      <ModalContainer
        screenWidth={width}
        screenHeight={height}
        modalWidth={CONFIG.modal.subagentWidth}
        borderColor={theme.warning}
        backgroundColor={theme.bg}
      >
        <text style={{ attributes: TextAttributes.BOLD }} fg={theme.warning}>
          Cannot Open Subagent in Browser
        </text>
        <Col marginTop={1}>
          <text>OpenCode's web UI doesn't support</text>
          <text>direct links to subagent sessions.</text>
        </Col>
        <Row marginTop={1}>
          <text>Open the parent session instead?</text>
        </Row>
        <Row marginTop={1}>
          <text style={{ attributes: TextAttributes.DIM }}>{"Parent: "}</text>
          <text>{truncateText(modal.parentSession.name || "Unknown", 28)}</text>
        </Row>
        <Row marginTop={1} justifyContent="center">
          <text style={{ attributes: TextAttributes.BOLD }} fg={theme.success}>
            [Y]
          </text>
          <text> Open Parent </text>
          <text style={{ attributes: TextAttributes.BOLD }} fg={theme.error}>
            [N]
          </text>
          <text> Cancel</text>
        </Row>
      </ModalContainer>
    );
  }

  if (modal.type === "server-unavailable") {
    return (
      <ModalContainer
        screenWidth={width}
        screenHeight={height}
        modalWidth={CONFIG.modal.serverUnavailableWidth}
        borderColor={theme.error}
        backgroundColor={theme.bg}
      >
        <text style={{ attributes: TextAttributes.BOLD }} fg={theme.error}>
          Server Unavailable
        </text>
        <Col marginTop={1}>
          <text>Cannot reach server:</text>
          <text style={{ attributes: TextAttributes.BOLD }}>
            {modal.serverName}
          </text>
        </Col>
        <Row marginTop={1}>
          <text style={{ attributes: TextAttributes.DIM }}>
            {modal.serverUrl}
          </text>
        </Row>
        <Row marginTop={1}>
          <text>The server may have shut down.</text>
        </Row>
        <Col marginTop={1}>
          <text style={{ attributes: TextAttributes.DIM }}>
            Tip: For remote access, start OpenCode with:
          </text>
          <text style={{ attributes: TextAttributes.DIM }}>
            {"    opencode --hostname 0.0.0.0"}
          </text>
        </Col>
        <Row marginTop={1} justifyContent="center">
          <text style={{ attributes: TextAttributes.BOLD }} fg="gray">
            [Enter]
          </text>
          <text> OK</text>
        </Row>
      </ModalContainer>
    );
  }

  if (modal.type === "tui-server-unavailable") {
    return (
      <ModalContainer
        screenWidth={width}
        screenHeight={height}
        modalWidth={CONFIG.modal.tuiServerUnavailableWidth}
        borderColor={theme.error}
        backgroundColor={theme.bg}
      >
        <text style={{ attributes: TextAttributes.BOLD }} fg={theme.error}>
          Cannot Attach to Session
        </text>
        <Col marginTop={1}>
          <text>Cannot reach server:</text>
          <text style={{ attributes: TextAttributes.BOLD }}>
            {modal.serverName}
          </text>
        </Col>
        <Row marginTop={1}>
          <text style={{ attributes: TextAttributes.DIM }}>
            {modal.serverUrl}
          </text>
        </Row>
        <Row marginTop={1}>
          <text>Server is not reachable from this machine.</text>
        </Row>
        <Col marginTop={1}>
          <text style={{ attributes: TextAttributes.DIM }}>
            Tip: For remote access, start OpenCode with:
          </text>
          <text style={{ attributes: TextAttributes.DIM }}>
            {"    opencode --hostname 0.0.0.0"}
          </text>
        </Col>
        <Row marginTop={1} justifyContent="center">
          <text style={{ attributes: TextAttributes.BOLD }} fg="gray">
            [Enter]
          </text>
          <text> OK</text>
        </Row>
      </ModalContainer>
    );
  }

  if (modal.type === "http-disabled") {
    return (
      <ModalContainer
        screenWidth={width}
        screenHeight={height}
        modalWidth={CONFIG.modal.serverUnavailableWidth}
        borderColor={theme.warning}
        backgroundColor={theme.bg}
      >
        <text style={{ attributes: TextAttributes.BOLD }} fg={theme.warning}>
          Cannot Open in Browser
        </text>
        <Col marginTop={1}>
          <text>HTTP server is not enabled for:</text>
          <text style={{ attributes: TextAttributes.BOLD }}>
            {modal.serverName}
          </text>
        </Col>
        <Col marginTop={1}>
          <text>OpenCode must be configured or started</text>
          <text>with HTTP server enabled to use</text>
          <text>browser access.</text>
        </Col>
        <Row marginTop={1} justifyContent="center">
          <text style={{ attributes: TextAttributes.BOLD }} fg="gray">
            [Enter]
          </text>
          <text> OK</text>
        </Row>
      </ModalContainer>
    );
  }

  if (modal.type === "http-disabled-tui") {
    return (
      <ModalContainer
        screenWidth={width}
        screenHeight={height}
        modalWidth={CONFIG.modal.tuiServerUnavailableWidth}
        borderColor={theme.warning}
        backgroundColor={theme.bg}
      >
        <text style={{ attributes: TextAttributes.BOLD }} fg={theme.warning}>
          Cannot Attach to Session
        </text>
        <Col marginTop={1}>
          <text>HTTP server is not enabled for:</text>
          <text style={{ attributes: TextAttributes.BOLD }}>
            {modal.serverName}
          </text>
        </Col>
        <Col marginTop={1}>
          <text>OpenCode must be configured or started</text>
          <text>with HTTP server enabled to attach</text>
          <text>to sessions.</text>
        </Col>
        <Row marginTop={1} justifyContent="center">
          <text style={{ attributes: TextAttributes.BOLD }} fg="gray">
            [Enter]
          </text>
          <text> OK</text>
        </Row>
      </ModalContainer>
    );
  }

  return null;
}
