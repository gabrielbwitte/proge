import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
} from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getSetting, setSetting } from "@/db/settings-repo";
import { isTauri } from "@/lib/tauri";
import { closeStaleStages, desiredStageLabels, isStageRoute, openStage, awaitStageCreated } from "./stage-window";

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
 * mesmo quando já estava aberta em outro. Criação é windowed em (x,y) e só
 * depois entra em fullscreen, para o SO colocar a janela no monitor certo.
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
    try {
      await existing.setPosition(pos);
    } catch {
      // Posição pode falhar em fullscreen: o setFullscreen(false) acima cobre.
    }
    try {
      await existing.setFullscreen(true);
    } catch {
      // Visível mesmo sem fullscreen: aceita.
    }
    await existing.show().catch(() => {});
    await existing.setFocus().catch(() => {});
    return;
  }
  let created: WebviewWindow | null = null;
  try {
    created = new WebviewWindow(label, {
      url: "index.html#/stage",
      title: "Proge — Telão",
      x: pos.x,
      y: pos.y,
      width: 960,
      height: 600,
      decorations: false,
      skipTaskbar: true,
    });
  } catch (e) {
    throw new Error(
      `Não foi possível criar a janela "${label}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  // O construtor nunca lança por falha do backend: o erro chega via
  // `tauri://error` e aqui vira exceção (antes sumia em silêncio).
  await awaitStageCreated(created, label);
  try {
    await created.setPosition(pos);
  } catch (e) {
    throw new Error(
      `Janela "${label}" criada, mas não foi posicionar no monitor: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    await created.setFullscreen(true);
  } catch (e) {
    throw new Error(
      `Janela "${label}" criada, mas não foi entrar em fullscreen: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  await created.show().catch(() => {});
}

/**
 * Aplica o layout: operador no seu monitor + uma janela fullscreen por saída,
 * na ordem configurada. Sem saídas configuradas, abre o telão padrão.
 * Janelas de monitores removidos são fechadas.
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
    await openStage();
    return;
  }
  const labels = desiredStageLabels(targets.length);
  await closeStaleStages(labels);
  // Em série: evita condição de corrida na criação e garante
  // uma janela fullscreen por saída, no monitor certo.
  for (let i = 0; i < targets.length; i++) {
    await placeStageOn(labels[i], targets[i]);
  }
  // Segurança: fecha qualquer órfã que tenha sobrevivido.
  await closeStaleStages(labels);
}

/**
 * Auto-aplicação no boot (só janela do operador): restaura o layout salvo e
 * abre/posiciona uma janela fullscreen por saída. Sem layout salvo e com 2+
 * monitores, usa as saídas automáticas e salva. Idempotente e silenciosa.
 */
export async function autoApplySavedLayout(): Promise<void> {
  if (!isTauri()) return;
  try {
    if (isStageRoute()) return;
    const monitors = await listMonitors();
    if (monitors.length === 0) return;
    const keys = new Set(monitors.map((m) => m.key));
    const saved = await loadLayout();
    const operator =
      saved.operator && keys.has(saved.operator)
        ? saved.operator
        : ((await currentMonitorKey()) ?? null);
    const savedTargets = saved.outputs.filter((k) => keys.has(k));
    let outputs = savedTargets;
    if (outputs.length === 0 && monitors.length > 1) {
      outputs = autoOutputs(monitors, operator).map((m) => m.key);
      await saveLayout({ operator, outputs }).catch(() => {});
    }
    if (outputs.length === 0) return;
    const layout: StageLayout = { operator, outputs };
    await applyLayout(layout, monitors);
  } catch (e) {
    // Boot nunca deve quebrar por causa dos telões, mas o erro fica no console.
    console.error("[proge] autoApplySavedLayout:", e);
  }
}
