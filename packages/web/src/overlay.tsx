"use client";

import { useEffect } from "react";

import { formatHistoryTime, OVERLAY_FONT_FAMILY } from "./overlay/utils";
import {
  OverlayChatPanel,
  OverlayHeader,
  OverlayHistoryPanel,
  OverlayLauncherButton,
  OverlayLoginPanel,
} from "./overlay/components";
import { overlayClass } from "./overlay/class-names";
import { ensureOverlayCoreStyles } from "./overlay/core-styles";
import { useOverlayController } from "./overlay/controller";

export type WebmasterDroidOverlayProps = {
  injectCoreStyles?: boolean;
};

export function WebmasterDroidOverlay({ injectCoreStyles = true }: WebmasterDroidOverlayProps) {
  const controller = useOverlayController();
  useEffect(() => {
    if (!injectCoreStyles) {
      return;
    }

    ensureOverlayCoreStyles();
  }, [injectCoreStyles]);

  if (!controller.isAdminMode) {
    return null;
  }

  return (
    <>
      {controller.isOpen ? (
        <div
          ref={controller.overlayRootRef}
          data-admin-overlay-root
          className={overlayClass(
            "panel",
            "fixed bottom-4 right-4 z-[100] flex h-[62vh] w-[min(480px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-stone-300 bg-[#f6f2eb] text-stone-900 shadow-2xl"
          )}
          style={{ fontFamily: OVERLAY_FONT_FAMILY }}
        >
          <OverlayHeader
            isAuthenticated={controller.isAuthenticated}
            publishState={controller.publishState}
            activeTab={controller.activeTab}
            historyCount={controller.history.published.length + controller.history.checkpoints.length}
            clearChatDisabled={controller.clearChatDisabled}
            onPublish={() => {
              void controller.onPublish();
            }}
            onTabChange={controller.setActiveTab}
            onClearChat={controller.onClearChat}
            onClose={() => controller.setIsOpen(false)}
          />

          {!controller.isAuthenticated ? (
            <OverlayLoginPanel
              authConfigured={controller.authConfigured}
              email={controller.email}
              password={controller.password}
              signingIn={controller.signingIn}
              onEmailChange={controller.setEmail}
              onPasswordChange={controller.setPassword}
              onSignIn={() => {
                void controller.signInWithPassword();
              }}
            />
          ) : controller.activeTab === "chat" ? (
            <OverlayChatPanel
              messages={controller.messages}
              chatEndRef={controller.chatEndRef}
              showAssistantAvatarImage={controller.showAssistantAvatarImage}
              assistantAvatarUrl={controller.assistantAvatarUrl}
              assistantAvatarFallbackLabel={controller.assistantAvatarFallbackLabel}
              onAssistantAvatarError={() => controller.setAssistantAvatarFailed(true)}
              showModelPicker={controller.showModelPicker}
              selectableModels={controller.selectableModels}
              modelId={controller.modelId}
              sending={controller.sending}
              onModelChange={controller.setModelId}
              selectedElement={controller.selectedElement}
              onClearSelectedElement={controller.clearSelectedElement}
              message={controller.message}
              onMessageChange={controller.setMessage}
              onMessageKeyDown={controller.onMessageKeyDown}
              onSend={() => {
                void controller.onSend();
              }}
              isAuthenticated={controller.isAuthenticated}
            />
          ) : (
            <OverlayHistoryPanel
              history={controller.history}
              deletingCheckpointId={controller.deletingCheckpointId}
              onRestorePublished={(item) => {
                void controller.onRollback(
                  { sourceType: "published", sourceId: item.id },
                  `published snapshot at ${formatHistoryTime(item.createdAt)}`
                );
              }}
              onRestoreCheckpoint={(item) => {
                void controller.onRollback(
                  { sourceType: "checkpoint", sourceId: item.id },
                  `checkpoint at ${formatHistoryTime(item.createdAt)}`
                );
              }}
              onDeleteCheckpoint={(item) => {
                void controller.onDeleteCheckpoint(item);
              }}
            />
          )}
        </div>
      ) : (
        <OverlayLauncherButton onOpen={() => controller.setIsOpen(true)} />
      )}
    </>
  );
}
