// Transporte operador -> telão.
// Usa eventos Tauri quando disponíveis + BroadcastChannel como fallback
// (permite testar as duas janelas com `npm run dev` no browser).
import { emit, listen } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/tauri";
import type { FundoWallpapers, ProjectPayload } from "./types";

export const PROJECT_EVENT = "proge:project";
export const CLEAR_EVENT = "proge:clear";
export const WALLPAPERS_EVENT = "proge:wallpapers";

const CHANNEL_NAME = "proge-stage";

type ChannelMessage = {
  type: string;
  payload?: ProjectPayload;
  wallpapers?: FundoWallpapers;
};

function postToChannel(message: ChannelMessage) {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel indisponível: ignora, o evento Tauri cobre.
  }
}

export async function emitProject(payload: ProjectPayload): Promise<void> {
  postToChannel({ type: PROJECT_EVENT, payload });
  if (isTauri()) {
    try {
      await emit(PROJECT_EVENT, payload);
    } catch {
      // Fallback do BroadcastChannel já entregue acima.
    }
  }
}

export async function emitClear(): Promise<void> {
  postToChannel({ type: CLEAR_EVENT });
  if (isTauri()) {
    try {
      await emit(CLEAR_EVENT);
    } catch {
      // Fallback do BroadcastChannel já entregue acima.
    }
  }
}

/** Notifica todas as janelas (operador + telões) sobre troca de fundos. */
export async function emitWallpapers(wallpapers: FundoWallpapers): Promise<void> {
  postToChannel({ type: WALLPAPERS_EVENT, wallpapers });
  notifyLocalWallpapers(wallpapers);
  if (isTauri()) {
    try {
      await emit(WALLPAPERS_EVENT, wallpapers);
    } catch {
      // Fallback do BroadcastChannel já entregue acima.
    }
  }
}

/**
 * Evento DOM local (`fundo:wallpapers`) — mesma janela. Mantido para
 * compatibilidade com ouvintes existentes; o cross-window usa o canal acima.
 */
export function notifyLocalWallpapers(wallpapers: FundoWallpapers): void {
  try {
    window.dispatchEvent(
      new CustomEvent("fundo:wallpapers", { detail: wallpapers }),
    );
  } catch {
    // Ambiente sem DOM: ignora.
  }
}

export type StageUnlisten = () => void;

/**
 * Escuta trocas de fundos em qualquer janela (operador extra ou telão).
 * Idempotente: o mesmo estado aplicado duas vezes resulta no mesmo estado.
 */
export async function subscribeWallpapers(
  onWallpapers: (wallpapers: FundoWallpapers) => void,
): Promise<StageUnlisten> {
  const onMessage = (event: MessageEvent<ChannelMessage>) => {
    const data = event.data;
    if (!data || typeof data.type !== "string") return;
    if (data.type === WALLPAPERS_EVENT && data.wallpapers)
      onWallpapers(data.wallpapers);
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = onMessage;
  } catch {
    channel = null;
  }

  const handler = (e: Event) => {
    const detail = (e as CustomEvent<FundoWallpapers>).detail;
    if (detail && typeof detail === "object") onWallpapers(detail);
  };
  try {
    window.addEventListener("fundo:wallpapers", handler as EventListener);
  } catch {
    // Ambiente sem DOM: ignora.
  }

  let unlisten: (() => void) | null = null;
  if (isTauri()) {
    try {
      unlisten = await listen<FundoWallpapers>(WALLPAPERS_EVENT, (e) =>
        onWallpapers(e.payload),
      );
    } catch {
      unlisten = null;
    }
  }

  return () => {
    channel?.close();
    try {
      window.removeEventListener("fundo:wallpapers", handler as EventListener);
    } catch {
      // Ambiente sem DOM: ignora.
    }
    unlisten?.();
  };
}

/**
 * Escuta projetar/limpar na janela stage. Idempotente: o mesmo payload
 * aplicado duas vezes (Tauri + BroadcastChannel) resulta no mesmo estado.
 */
export async function subscribeStage(
  onProject: (payload: ProjectPayload) => void,
  onClear: () => void,
  onWallpapers?: (wallpapers: FundoWallpapers) => void,
): Promise<StageUnlisten> {
  const onMessage = (event: MessageEvent<ChannelMessage>) => {
    const data = event.data;
    if (!data || typeof data.type !== "string") return;
    if (data.type === PROJECT_EVENT && data.payload) onProject(data.payload);
    if (data.type === CLEAR_EVENT) onClear();
    if (data.type === WALLPAPERS_EVENT && data.wallpapers)
      onWallpapers?.(data.wallpapers);
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = onMessage;
  } catch {
    channel = null;
  }

  let unlistenProject: (() => void) | null = null;
  let unlistenClear: (() => void) | null = null;
  let unlistenWallpapers: (() => void) | null = null;
  if (isTauri()) {
    try {
      unlistenProject = await listen<ProjectPayload>(PROJECT_EVENT, (e) =>
        onProject(e.payload),
      );
      unlistenClear = await listen(CLEAR_EVENT, () => onClear());
      if (onWallpapers) {
        unlistenWallpapers = await listen<FundoWallpapers>(
          WALLPAPERS_EVENT,
          (e) => onWallpapers(e.payload),
        );
      }
    } catch {
      unlistenProject = null;
      unlistenClear = null;
      unlistenWallpapers = null;
    }
  }

  return () => {
    channel?.close();
    unlistenProject?.();
    unlistenClear?.();
    unlistenWallpapers?.();
  };
}
