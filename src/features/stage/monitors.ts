import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
} from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getSetting, setSetting } from "@/db/settings-repo";
import { isTauri } from "@/lib/tauri";
import { STAGE_LABELS } from "./stage-window";

export interface MonitorInfo {
  /** Identidade estável: nome do SO ou `monitor-x-y`. */
  key: string;
  name: string;
  /** Tamanho e origem em pixels lógicos. */
  width: number;
  height: number;
  x: number;
  y: number;
  /** Proporção calculada (ex.: "16:9"). */
  aspect: string;
  isPrimaryGuess: boolean;
}

/** "1920×1080" -> "16:9" via MDC. */
export function aspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "—";
  let a = width;
  let b = height;
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return `${width / a}:${height / a}`;
}

export interface StageLayout {
  /** Monitor da janela do operador (null = onde já está). */
  operator: string | null;
  /** Monitores de exibição, na ordem das saídas (telão, 2ª, 3ª…). */
  outputs: string[];
}

const LAYOUT_KEY = "stage.layout";

export const EMPTY_LAYOUT: StageLayout = { operator: null, outputs: [] };

export async function listMonitors(): Promise<MonitorInfo[]> {
  if (!isTauri()) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    return [
      {
        key: "browser",
        name: "Tela do navegador",
        width,
        height,
        x: 0,
        y: 0,
        aspect: aspectRatio(width, height),
        isPrimaryGuess: true,
      },
    ];
  }
  try {
    const all = await availableMonitors();
    return all.map((m, i) => {
      const pos = m.position.toLogical(m.scaleFactor);
      const size = m.size.toLogical(m.scaleFactor);
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      const width = Math.round(size.width);
      const height = Math.round(size.height);
      return {
        key: m.name ?? `monitor-${x}-${y}`,
        name: m.name ?? `Monitor ${i + 1}`,
        width,
        height,
        x,
        y,
        aspect: aspectRatio(width, height),
        isPrimaryGuess: x === 0 && y === 0,
      };
    });
  } catch {
    return [];
  }
}

/** Monitor onde a janela do operador está (para excluir das saídas). */
export async function currentMonitorKey(): Promise<string | null> {
  if (!isTauri()) return "browser";
  try {
    const m = await currentMonitor();
    if (!m) return null;
    const pos = m.position.toLogical(m.scaleFactor);
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    return m.name ?? `monitor-${x}-${y}`;
  } catch {
    return null;
  }
}

/**
 * Saídas automáticas: todos os monitores conectados menos o do operador,
 * ordenados da esquerda para a direita, de cima para baixo
 * (acompanha o arranjo físico). O operador não define a quantidade.
 */
export function autoOutputs(
  monitors: MonitorInfo[],
  operatorKey: string | null,
): MonitorInfo[] {
  return monitors
    .filter((m) => m.key !== operatorKey)
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

export async function loadLayout(): Promise<StageLayout> {
  try {
    const raw = await getSetting(LAYOUT_KEY);
    if (!raw) return EMPTY_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<StageLayout>;
    return {
      operator: typeof parsed.operator === "string" ? parsed.operator : null,
      outputs: Array.isArray(parsed.outputs)
        ? parsed.outputs.filter((o): o is string => typeof o === "string")
        : [],
    };
  } catch {
    return EMPTY_LAYOUT;
  }
}

export async function saveLayout(layout: StageLayout): Promise<void> {
  await setSetting(LAYOUT_KEY, JSON.stringify(layout));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Move a janela do operador para o monitor escolhido e centraliza. */
export async function moveOperatorTo(m: MonitorInfo): Promise<void> {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  await win.setPosition(new LogicalPosition(m.x + 60, m.y + 60));
  await win.center();
  await win.setFocus();
}

/**
 * Posiciona/abre a saída `label` no monitor, em fullscreen.
 * Sair e voltar de fullscreen garante que a janela vá para o monitor certo
 * mesmo quando já estava aberta em outro.
 */
export async function placeStageOn(
  label: string,
  m: MonitorInfo,
): Promise<void> {
  if (!isTauri()) {
    window.open(`${window.location.pathname}#/stage`, "_blank", "noopener");
    return;
  }
  const pos = new LogicalPosition(m.x + 40, m.y + 40);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    try {
      await existing.setFullscreen(false);
    } catch {
      // Nem sempre estava em fullscreen: segue o fluxo.
    }
    await existing.setPosition(pos);
    await existing.setFullscreen(true);
    await existing.show();
    return;
  }
  new WebviewWindow(label, {
    url: "index.html#/stage",
    title: "Proge — Telão",
    x: pos.x,
    y: pos.y,
    width: 960,
    height: 600,
    decorations: false,
    skipTaskbar: true,
  });
  for (let i = 0; i < 30; i++) {
    await delay(100);
    const w = await WebviewWindow.getByLabel(label);
    if (w) {
      try {
        await w.setFullscreen(true);
      } catch {
        // Visível mesmo sem fullscreen: aceita.
      }
      return;
    }
  }
}

/**
 * Aplica o layout: operador no seu monitor + cada saída no seu monitor,
 * na ordem configurada. Sem saídas configuradas, abre o telão padrão.
 */
export async function applyLayout(
  layout: StageLayout,
  monitors: MonitorInfo[],
): Promise<void> {
  const byKey = new Map(monitors.map((m) => [m.key, m]));
  if (layout.operator) {
    const target = byKey.get(layout.operator);
    if (target) await moveOperatorTo(target);
  }
  const targets = layout.outputs
    .map((key) => byKey.get(key))
    .filter((m): m is MonitorInfo => m != null);
  if (targets.length === 0) {
    const { openStage } = await import("./stage-window");
    await openStage(STAGE_LABELS[0]);
    return;
  }
  for (let i = 0; i < targets.length && i < STAGE_LABELS.length; i++) {
    await placeStageOn(STAGE_LABELS[i], targets[i]);
  }
}
