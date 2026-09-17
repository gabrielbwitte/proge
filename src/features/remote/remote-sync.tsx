import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/tauri";
import { getMediaDir } from "../media/media-repo";
import { useProjection } from "../projection/store";
import type { ModuleId, ProjectableItem } from "../projection/types";
import { remoteGetStatus, remoteStart, remoteSync } from "./remote-api";
import {
  REMOTE_ACTION_EVENT,
  type RemoteAction,
  type RemoteItemDto,
} from "./types";

const PUSH_DEBOUNCE_MS = 150;

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

  // Servidor em pé por padrão: sobe no boot do operador (idempotente).
  React.useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const s = await remoteGetStatus();
        if (!s.running) await remoteStart();
      } catch {
        // Sem backend ou porta ocupada: o card de Sistema mostra o estado.
      }
    })();
  }, []);

  // Espelho → Rust (melhor esforço; só existe servidor no Tauri).
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
          });
        } catch {
          // Espelho é melhor esforço: nunca quebra o operador.
        }
      })();
    }, PUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [module, items, selectedIndex, live, projected]);

  // Ações do celular → store (registra uma vez, usa refs p/ frescor).
  const latest = React.useRef({
    selectIndex,
    stepNext,
    stepPrev,
    projectSelected,
    clear,
    onModuleChange,
  });
  latest.current = {
    selectIndex,
    stepNext,
    stepPrev,
    projectSelected,
    clear,
    onModuleChange,
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
