import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@/lib/tauri";

/** Labels das janelas de saída (telões). Esquema dinâmico: `stage`, `stage-2`, … `stage-N`.
 *  Uma janela fullscreen por saída de vídeo. Cobertos em capabilities via `stage` + `stage-*`. */
export const STAGE_LABELS = ["stage", "stage-2", "stage-3"] as const;

/** Label da saída `index` (0-based): 0 → "stage", 1 → "stage-2", N → "stage-N+1". */
export function stageLabel(index: number): string {
  if (index <= 0) return "stage";
  if (index === 1) return "stage-2";
  return `stage-${index + 1}`;
}

/** Labels desejados para `count` saídas, na ordem das saídas. */
export function desiredStageLabels(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => stageLabel(i));
}

/** Verdadeiro para qualquer janela de telão (`stage`, `stage-N`). */
export function isStageLabel(label: string): boolean {
  return label === "stage" || label.startsWith("stage-");
}

type StageWindowLike = {
  label: string;
  close: () => Promise<void>;
};

/** Todas as janelas de telão abertas. Usa `getAll` quando disponível, senão sonda labels. */
export async function listStageWindows(): Promise<StageWindowLike[]> {
  try {
    const withGetAll = WebviewWindow as unknown as {
      getAll?: () => Promise<StageWindowLike[]>;
    };
    if (typeof withGetAll.getAll === "function") {
      const all = await withGetAll.getAll();
      return all.filter((w) => isStageLabel(w.label));
    }
  } catch {
    // Cai no fallback de sondagem abaixo.
  }
  const found: StageWindowLike[] = [];
  // Sonda os primeiros 16 labels (cobre cenários reais sem varrer indefinidamente).
  for (let i = 0; i < 16; i++) {
    try {
      const w = await WebviewWindow.getByLabel(stageLabel(i));
      if (w) found.push(w as unknown as StageWindowLike);
    } catch {
      // Label inexistente: ignora.
    }
  }
  return found;
}

export function isStageRoute(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#/stage")
  );
}

function openStageFallback() {
  window.open(`${window.location.pathname}#/stage`, "_blank", "noopener");
}

function describeStageError(label: string, payload: unknown): string {
  if (typeof payload === "string" && payload.length > 0) return payload;
  try {
    return `Falha ao criar a janela "${label}": ${JSON.stringify(payload)}`;
  } catch {
    return `Falha ao criar a janela "${label}".`;
  }
}

/**
 * Aguarda o backend confirmar a criação da janela.
 * `new WebviewWindow()` nunca lança: o erro chega via `tauri://error`.
 * Sem isso a falha é silenciosa ("a window não é criada").
 */
export function awaitStageCreated(
  win: WebviewWindow,
  label: string,
  timeoutMs = 8000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Tempo esgotado criando a janela "${label}".`));
      }
    }, timeoutMs);
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    win
      .once("tauri://created", () => settle(resolve))
      .catch(() => {});
    win
      .once("tauri://error", (e) =>
        settle(() => reject(new Error(describeStageError(label, e.payload)))),
      )
      .catch(() => {});
  });
}

/** Abre a janela stage (ou foca se já existir). Idempotente por label.
 *  Garante fullscreen: cria em fullscreen e reforça após abrir.
 *  Em Tauri, propaga o erro do backend (sem fallback silencioso). */
export async function openStage(
  label: string = STAGE_LABELS[0],
): Promise<void> {
  if (!isTauri()) {
    openStageFallback();
    return;
  }
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    try {
      await existing.setFullscreen(true);
    } catch {
      // Já estava utilizável: segue para foco/show.
    }
    await existing.show().catch(() => {});
    await existing.setFocus().catch(() => {});
    return;
  }
  const win = new WebviewWindow(label, {
    url: "index.html#/stage",
    title: "Proge — Telão",
    fullscreen: true,
    decorations: false,
    skipTaskbar: true,
  });
  // Lança se o backend recusar (ex.: permissão ausente) — erro chega aqui,
  // não mais some em silêncio.
  await awaitStageCreated(win, label);
  await win.show().catch(() => {});
  try {
    await win.setFullscreen(true);
  } catch {
    // Visível mesmo sem fullscreen: aceita.
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
  if (!isTauri()) return;
  try {
    const stages = await listStageWindows();
    if (stages.length > 0) {
      await Promise.all(stages.map((w) => w.close().catch(() => {})));
      return;
    }
  } catch {
    // Cai no fallback legado abaixo.
  }
  await Promise.all(STAGE_LABELS.map((label) => closeStage(label)));
}

/** Fecha telões fora da lista desejada (monitores desconectados/removidos). */
export async function closeStaleStages(desired: string[]): Promise<void> {
  if (!isTauri()) return;
  const keep = new Set(desired);
  try {
    const stages = await listStageWindows();
    await Promise.all(
      stages
        .filter((w) => !keep.has(w.label))
        .map((w) => w.close().catch(() => {})),
    );
  } catch {
    // Nada a fazer: órfãs ficam para o próximo "Fechar telões".
  }
}
