import * as React from "react";
import { getWallpapers } from "../fundo/fundo-repo";
import { resolveAssetUrl } from "../media/media-repo";
import { emitClear, emitProject } from "./events";
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
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<FundoWallpapers>).detail;
      if (detail && typeof detail === "object") wallpapersRef.current = detail;
    };
    window.addEventListener("fundo:wallpapers", handler as EventListener);
    return () => window.removeEventListener("fundo:wallpapers", handler as EventListener);
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

  const projectSelected = React.useCallback(async () => {
    const item = items[selectedIndex];
    if (!item) return;
    if (item.kind === "image" || item.kind === "video") {
      const payload: ProjectPayload = {
        kind: item.kind,
        title: item.title,
        body: item.body,
        ref: item.ref,
        mediaUrl: item.mediaUrl,
        videoOpts: item.videoOpts,
        category: item.category,
      };
      await emitProject(payload);
      setProjected(payload);
      setLive(true);
      return;
    }
    const wallpapers = wallpapersRef.current;
    const bg = wallpaperFor(item.category, wallpapers);
    const payload: ProjectPayload = {
      kind: item.kind,
      title: item.title,
      body: item.body,
      ref: item.ref,
      mediaUrl: item.mediaUrl,
      videoOpts: item.videoOpts,
      category: item.category,
      theme: bg ? { ...DEFAULT_STAGE_THEME, backgroundImage: bg } : undefined,
    };
    await emitProject(payload);
    setProjected(payload);
    setLive(true);
  }, [items, selectedIndex]);

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
