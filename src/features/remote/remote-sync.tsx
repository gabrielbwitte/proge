import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/tauri";
import { getMediaDir } from "../media/media-repo";
import { useProjection } from "../projection/store";
import type { ModuleId, ProjectableItem } from "../projection/types";
import { useBibleNav } from "../biblia/nav-store";
import { useSongsNav } from "../letras/songs-store";
import { remoteGetStatus, ensureRemoteServer, remoteSync } from "./remote-api";
import {
  REMOTE_ACTION_EVENT,
  type BibleNavDto,
  type RemoteAction,
  type RemoteItemDto,
  type SongsNavDto,
} from "./types";

const PUSH_DEBOUNCE_MS = 150;

/** Resultados de busca espelhados (cap p/ não inchar o snapshot). */
const MAX_SONG_RESULTS = 50;

const REMOTE_MODULES = new Set<ModuleId>(["biblia", "letras", "fotos", "videos"]);

function toDto(item: ProjectableItem): RemoteItemDto {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    ref: item.ref,
    category: item.category,
    has_media: item.kind === "image" || item.kind === "video",
  };
}

interface BridgeProps {
  module: ModuleId;
  onModuleChange: (module: ModuleId) => void;
}

/**
 * Ponte operador <-> servidor remoto. Não renderiza nada.
 * - Empurra o espelho (módulo, itens, seleção, NO AR) ao Rust com debounce.
 * - Executa ações vindas do celular (`proge:remote-action`).
 * Regra de projeção preservada: só `project`/`clear` alteram o telão
 * a partir de tela limpa (`step` só reprojeta se já NO AR).
 */
export function RemoteSyncBridge({ module, onModuleChange }: BridgeProps) {
  const {
    items,
    selectedIndex,
    live,
    projected,
    selectIndex,
    stepNext,
    stepPrev,
    projectSelected,
    clear,
  } = useProjection();
  const bibleNav = useBibleNav();
  const songsNav = useSongsNav();

  // Servidor em pé por padrão: sobe no boot do operador (idempotente,
  // reaproveitando porta/PIN salvos).
  React.useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const s = await remoteGetStatus();
        if (!s.running) await ensureRemoteServer();
      } catch {
        // Sem backend ou porta ocupada: o card de Sistema mostra o estado.
      }
    })();
  }, []);

  // Espelho → Rust (melhor esforço; só existe servidor no Tauri).
  const bibleDto = React.useMemo<BibleNavDto>(
    () => ({
      versions: bibleNav.versions.map((v) => ({ version: v.version, name: v.name })),
      books: bibleNav.books.map((b) => ({ abbrev: b.abbrev, name: b.name, chapters: b.chapters })),
      version: bibleNav.version,
      book: bibleNav.book,
      chapter: bibleNav.chapter,
    }),
    [bibleNav.versions, bibleNav.books, bibleNav.version, bibleNav.book, bibleNav.chapter],
  );
  const letrasDto = React.useMemo<SongsNavDto>(
    () => ({
      results: songsNav.results
        .slice(0, MAX_SONG_RESULTS)
        .map((r) => ({ id: r.id, title: r.title, artist: r.artist })),
      selectedId: songsNav.selectedId,
      query: songsNav.query,
    }),
    [songsNav.results, songsNav.selectedId, songsNav.query],
  );
  React.useEffect(() => {
    if (!isTauri()) return;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const [photos, videos] = await Promise.all([
            getMediaDir("photos").catch(() => ""),
            getMediaDir("videos").catch(() => ""),
          ]);
          const media_roots = [photos, videos].filter((d) => d.length > 0);
          await remoteSync({
            module,
            items: items.map(toDto),
            selected_index: selectedIndex,
            live,
            projected: projected ?? undefined,
            media_roots,
            bible: bibleDto,
            letras: letrasDto,
          });
        } catch {
          // Espelho é melhor esforço: nunca quebra o operador.
        }
      })();
    }, PUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, items, selectedIndex, live, projected, bibleDto, letrasDto]);

  // Ações do celular → stores (registra uma vez, usa refs p/ frescor).
  const latest = React.useRef({
    selectIndex,
    stepNext,
    stepPrev,
    projectSelected,
    clear,
    onModuleChange,
    bibleNav,
    songsNav,
  });
  latest.current = {
    selectIndex,
    stepNext,
    stepPrev,
    projectSelected,
    clear,
    onModuleChange,
    bibleNav,
    songsNav,
  };

  React.useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    listen<RemoteAction>(REMOTE_ACTION_EVENT, (event) => {
      const action = event.payload;
      const api = latest.current;
      switch (action.type) {
        case "select":
          if (typeof action.index === "number") api.selectIndex(action.index);
          break;
        case "next":
          void api.stepNext();
          break;
        case "prev":
          void api.stepPrev();
          break;
        case "project":
          void api.projectSelected();
          break;
        case "clear":
          void api.clear();
          break;
        case "module":
          if (action.module && REMOTE_MODULES.has(action.module)) {
            api.onModuleChange(action.module);
          }
          break;
        case "bible":
          if (action.version) api.bibleNav.setVersion(action.version);
          if (action.book) api.bibleNav.setBook(action.book);
          if (typeof action.chapter === "number") api.bibleNav.setChapter(action.chapter);
          api.onModuleChange("biblia");
          break;
        case "song":
          if (action.song_id) void api.songsNav.selectSong(action.song_id);
          api.onModuleChange("letras");
          break;
        case "search":
          if (typeof action.search_query === "string") api.songsNav.search(action.search_query);
          api.onModuleChange("letras");
          break;
      }
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {
        // Sem backend: ignora.
      });
    return () => unlisten?.();
  }, []);

  return null;
}
