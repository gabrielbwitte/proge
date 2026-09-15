import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@/lib/tauri";

/** Labels das janelas de saída (telões). Devem existir em capabilities/default.json. */
export const STAGE_LABELS = ["stage", "stage-2", "stage-3"] as const;

export function isStageRoute(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#/stage")
  );
}

function openStageFallback() {
  window.open(`${window.location.pathname}#/stage`, "_blank", "noopener");
}

/** Abre a janela stage (ou foca se já existir). Idempotente por label. */
export async function openStage(
  label: string = STAGE_LABELS[0],
): Promise<void> {
  if (!isTauri()) {
    openStageFallback();
    return;
  }
  try {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
      return;
    }
    new WebviewWindow(label, {
      url: "index.html#/stage",
      title: "Proge — Telão",
      fullscreen: true,
      decorations: false,
      skipTaskbar: true,
    });
  } catch {
    openStageFallback();
  }
}

export async function closeStage(
  label: string = STAGE_LABELS[0],
): Promise<void> {
  if (!isTauri()) return;
  try {
    const existing = await WebviewWindow.getByLabel(label);
    await existing?.close();
  } catch {
    // Janela já fechada ou indisponível: nada a fazer.
  }
}

export async function closeAllStages(): Promise<void> {
  await Promise.all(STAGE_LABELS.map((label) => closeStage(label)));
}
