import * as React from "react";
import { getSetting, setSetting } from "@/db/settings-repo";
import { useProjection } from "../projection/store";
import type { ProjectableItem } from "../projection/types";
import {
  localLyricsProvider,
  type LyricSong,
  type LyricsSearchResult,
} from "./provider";

const LAST_SONG_KEY = "lyrics.last_song";

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Operação falhou.";
}

export interface SongsNav {
  query: string;
  results: LyricsSearchResult[];
  selectedId: string | null;
  song: LyricSong | null;
  loading: boolean;
  error: string;
  /** Busca na biblioteca (vazio limpa os resultados). */
  search: (q: string) => void;
  /** Abre a música e publica os trechos no projection store. */
  selectSong: (id: string) => Promise<void>;
  setError: (msg: string) => void;
  /** Republica a música aberta (chamado ao entrar no módulo). */
  refresh: () => void;
}

const SongsNavCtx = React.createContext<SongsNav | null>(null);

export function useSongsNav(): SongsNav {
  const nav = React.useContext(SongsNavCtx);
  if (!nav) throw new Error("useSongsNav exige <SongsNavProvider>.");
  return nav;
}

/**
 * Biblioteca + música aberta compartilhadas entre o painel do operador e
 * o controle remoto: buscar/selecionar em qualquer ponta reflete na outra
 * (os trechos publicados viram os items do projection store).
 */
export function SongsNavProvider({ children }: { children: React.ReactNode }) {
  const { setItems } = useProjection();
  const [results, setResults] = React.useState<LyricsSearchResult[]>([]);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [song, setSong] = React.useState<LyricSong | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setError("");
      return;
    }
    try {
      setResults(await localLyricsProvider.search(q));
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }, []);

  const selectSong = React.useCallback(
    async (id: string) => {
      try {
        const data = await localLyricsProvider.fetchSong(id);
        setSong(data);
        setSelectedId(id);
        setError("");
        setSetting(LAST_SONG_KEY, id);
        const next: ProjectableItem[] = data.sections.map((s, i) => ({
          id: `${id}:${i}`,
          kind: "text",
          title: `${data.title} — ${s.label}`,
          body: s.body,
          category: "letra",
        }));
        setItems(next);
      } catch (e) {
        setError(message(e));
      }
    },
    [setItems],
  );

  // Restaura última música (biblioteca inicia vazia até buscar).
  React.useEffect(() => {
    (async () => {
      const last = await getSetting(LAST_SONG_KEY);
      if (last) await selectSong(last);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = React.useCallback(
    (q: string) => {
      setQuery(q);
      void reload(q);
    },
    [reload],
  );

  // `refresh` com identidade estável (só republica ao entrar no módulo).
  const selectedRef = React.useRef<string | null>(null);
  selectedRef.current = selectedId;
  const refresh = React.useCallback(() => {
    const id = selectedRef.current;
    if (id) void selectSong(id);
  }, [selectSong]);

  const value = React.useMemo<SongsNav>(
    () => ({
      query,
      results,
      selectedId,
      song,
      loading,
      error,
      search,
      selectSong,
      setError,
      refresh,
    }),
    [query, results, selectedId, song, loading, error, search, selectSong, refresh],
  );

  return <SongsNavCtx.Provider value={value}>{children}</SongsNavCtx.Provider>;
}
