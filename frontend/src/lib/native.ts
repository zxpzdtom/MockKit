import type { NativeMessage, NativePayload } from "../types";

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        native?: {
          postMessage(message: NativeMessage): void;
        };
      };
    };
    __receiveNativeState?: (payload: NativePayload) => void;
    __openMockKitSettings?: () => void;
  }
}

export function send(command: string, payload: Omit<NativeMessage, "command"> = {}) {
  window.webkit?.messageHandlers?.native?.postMessage({ command, ...payload });
}

export function openExternalUrl(url: string) {
  if (window.webkit?.messageHandlers?.native) {
    send("openExternal", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
