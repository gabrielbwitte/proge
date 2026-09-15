// Transporte operador -> telão.
// Usa eventos Tauri quando disponíveis + BroadcastChannel como fallback
// (permite testar as duas janelas com `npm run dev` no browser).
import { emit, listen } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/tauri";
import type { ProjectPayload } from "./types";

export const PROJECT_EVENT = "proge:project";
export const CLEAR_EVENT = "proge:clear";

const CHANNEL_NAME = "proge-stage";

function postToChannel(message: { type: string; payload?: ProjectPayload }) {
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

export type StageUnlisten = () => void;

/**
 * Escuta projetar/limpar na janela stage. Idempotente: o mesmo payload
 * aplicado duas vezes (Tauri + BroadcastChannel) resulta no mesmo estado.
 */
export async function subscribeStage(
  onProject: (payload: ProjectPayload) => void,
  onClear: () => void,
): Promise<StageUnlisten> {
  const onMessage = (event: MessageEvent<{ type?: string; payload?: ProjectPayload }>) => {
    const data = event.data;
    if (!data || typeof data.type !== "string") return;
    if (data.type === PROJECT_EVENT && data.payload) onProject(data.payload);
    if (data.type === CLEAR_EVENT) onClear();
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
  if (isTauri()) {
    try {
      unlistenProject = await listen<ProjectPayload>(PROJECT_EVENT, (e) =>
        onProject(e.payload),
      );
      unlistenClear = await listen(CLEAR_EVENT, () => onClear());
    } catch {
      unlistenProject = null;
      unlistenClear = null;
    }
  }

  return () => {
    channel?.close();
    unlistenProject?.();
    unlistenClear?.();
  };
}
