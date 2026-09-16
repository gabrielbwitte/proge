import * as React from "react";
import { getWallpapers } from "../fundo/fundo-repo";
import { resolveAssetUrl } from "../media/media-repo";
import { emitClear, emitProject, subscribeWallpapers } from "./events";
import type { FundoWallpapers, ProjectPayload, ProjectableItem } from "./types";
import { DEFAULT_STAGE_THEME } from "./types";

interface ProjectionState {
  items: ProjectableItem[];
  selectedIndex: number;
  /** Último conteúdo projetado (para o indicador "NO AR"). */
  projected: ProjectPayload | null;
  live: boolean;
  canPrev: boolean;
  canNext: boolean;
  canProject: boolean;
  setItems: (items: ProjectableItem[]) => void;
  selectIndex: (index: number) => void;
  /** Apenas navegação local — NUNCA emite para o telão. */
  selectNext: () => void;
  /** Apenas navegação local — NUNCA emite para o telão. */
  selectPrev: () => void;
  /**
   * Navega a seleção e, se já houver algo NO AR (`live`), atualiza o telão
   * com o novo item. Com tela limpa, só move a seleção (não reacende).
   */
  stepNext: () => Promise<void>;
  /** Idem `stepNext`, para trás. */
  stepPrev: () => Promise<void>;
  /** Único caminho (junto de `clear`) que altera a saída de vídeo. */
  projectSelected: () => Promise<void>;
  projectTest: () => Promise<void>;
  /** Único caminho (junto de `projectSelected`) que altera a saída de vídeo. */
  clear: () => Promise<void>;
}

const ProjectionContext = React.createContext<ProjectionState | null>(null);

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function wallpaperFor(category: ProjectableItem["category"], wallpapers: FundoWallpapers): string | undefined {
  const path =
    category === "biblia"
      ? wallpapers.biblia
      : category === "letra"
        ? wallpapers.letra
        : wallpapers.padrao;
  const fallback = wallpapers.padrao;
  const chosen = path ?? fallback;
  if (!chosen) return undefined;
  try {
    return resolveAssetUrl(chosen);
  } catch {
    return undefined;
  }
}

/** Monta o payload de um item (mídia ignora wallpaper; texto usa categoria). */
function buildPayload(item: ProjectableItem, wallpapers: FundoWallpapers): ProjectPayload {
  if (item.kind === "image" || item.kind === "video") {
    return {
      kind: item.kind,
      title: item.title,
      body: item.body,
      ref: item.ref,
      mediaUrl: item.mediaUrl,
      videoOpts: item.videoOpts,
      category: item.category,
    };
  }
  const bg = wallpaperFor(item.category, wallpapers);
  return {
    kind: item.kind,
    title: item.title,
    body: item.body,
    ref: item.ref,
    mediaUrl: item.mediaUrl,
    videoOpts: item.videoOpts,
    category: item.category,
    theme: bg ? { ...DEFAULT_STAGE_THEME, backgroundImage: bg } : undefined,
  };
}

export function ProjectionProvider({ children }: { children: React.ReactNode }) {
  const [items, setItemsState] = React.useState<ProjectableItem[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [projected, setProjected] = React.useState<ProjectPayload | null>(null);
  const [live, setLive] = React.useState(false);
  const wallpapersRef = React.useRef<FundoWallpapers>({});

  React.useEffect(() => {
    getWallpapers().then((w) => {
      wallpapersRef.current = w;
    });
    // Local + cross-window (outra janela do operador ou telão que alterou).
    let unlisten: (() => void) | null = null;
    subscribeWallpapers((w) => {
      wallpapersRef.current = w;
    }).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, []);

  const setItems = React.useCallback((next: ProjectableItem[]) => {
    setItemsState(next);
    setSelectedIndex(0);
  }, []);

  const selectIndex = React.useCallback(
    (index: number) => setSelectedIndex(clampIndex(index, items.length)),
    [items.length],
  );

  const selectNext = React.useCallback(() => {
    setSelectedIndex((i) => clampIndex(i + 1, items.length));
  }, [items.length]);

  const selectPrev = React.useCallback(() => {
    setSelectedIndex((i) => clampIndex(i - 1, items.length));
  }, [items.length]);

  const projectItem = React.useCallback(async (item: ProjectableItem) => {
    const payload = buildPayload(item, wallpapersRef.current);
    await emitProject(payload);
    setProjected(payload);
    setLive(true);
  }, []);

  const stepNext = React.useCallback(async () => {
    const next = clampIndex(selectedIndex + 1, items.length);
    setSelectedIndex(next);
    if (live) {
      const item = items[next];
      if (item) await projectItem(item);
    }
  }, [items, selectedIndex, live, projectItem]);

  const stepPrev = React.useCallback(async () => {
    const next = clampIndex(selectedIndex - 1, items.length);
    setSelectedIndex(next);
    if (live) {
      const item = items[next];
      if (item) await projectItem(item);
    }
  }, [items, selectedIndex, live, projectItem]);

  const projectSelected = React.useCallback(async () => {
    const item = items[selectedIndex];
    if (!item) return;
    await projectItem(item);
  }, [items, selectedIndex, projectItem]);

  const projectTest = React.useCallback(async () => {
    const wallpapers = wallpapersRef.current;
    const bg = wallpaperFor(undefined, wallpapers);
    const payload: ProjectPayload = {
      kind: "text",
      title: "Teste de projeção",
      body: "Se você está lendo isto no telão, a saída de vídeo está funcionando.",
      ref: "Proge",
      theme: bg ? { ...DEFAULT_STAGE_THEME, backgroundImage: bg } : undefined,
    };
    await emitProject(payload);
    setProjected(payload);
    setLive(true);
  }, []);

  const clear = React.useCallback(async () => {
    await emitClear();
    setLive(false);
  }, []);

  const value = React.useMemo<ProjectionState>(
    () => ({
      items,
      selectedIndex,
      projected,
      live,
      canPrev: selectedIndex > 0,
      canNext: selectedIndex < items.length - 1,
      canProject: items.length > 0,
      setItems,
      selectIndex,
      selectNext,
      selectPrev,
      stepNext,
      stepPrev,
      projectSelected,
      projectTest,
      clear,
    }),
    [
      items,
      selectedIndex,
      projected,
      live,
      setItems,
      selectIndex,
      selectNext,
      selectPrev,
      stepNext,
      stepPrev,
      projectSelected,
      projectTest,
      clear,
    ],
  );

  return (
    <ProjectionContext.Provider value={value}>
      {children}
    </ProjectionContext.Provider>
  );
}

export function useProjection(): ProjectionState {
  const ctx = React.useContext(ProjectionContext);
  if (!ctx) throw new Error("useProjection deve ser usado dentro de ProjectionProvider");
  return ctx;
}
