import * as React from "react";
import { getSetting, setSetting } from "@/db/settings-repo";
import { useProjection } from "../projection/store";
import type { ProjectableItem } from "../projection/types";
import {
  localLyricsProvider,
  parseLyricsText,
  serializeSections,
  type LyricSong,
  type LyricsSearchResult,
} from "./provider";
import { createSong, updateSong } from "./songs-repo";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

const LAST_SONG_KEY = "lyrics.last_song";

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Operação falhou.";
}

interface RepertoireEntry {
  entryId: string;
  songId: string;
  title: string;
  artist: string;
}

export function LetrasPanel() {
  const { items, selectedIndex, setItems, selectIndex } = useProjection();
  const [songs, setSongs] = React.useState<LyricsSearchResult[]>([]);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [song, setSong] = React.useState<LyricSong | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [formTitle, setFormTitle] = React.useState("");
  const [formArtist, setFormArtist] = React.useState("");
  const [formText, setFormText] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [repertoire, setRepertoire] = React.useState<RepertoireEntry[]>([]);
  const [repertoireQuery, setRepertoireQuery] = React.useState("");
  const [bibliotecaCollapsed, setBibliotecaCollapsed] = React.useState(false);

  const bibliotecaSelectedRef = React.useRef<HTMLDivElement | null>(null);
  const repertorioSelectedRef = React.useRef<HTMLDivElement | null>(null);
  const trechoSelectedRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    bibliotecaSelectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, songs]);

  React.useEffect(() => {
    repertorioSelectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, repertoire, repertoireQuery]);

  React.useEffect(() => {
    trechoSelectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, items]);

  const reload = React.useCallback(async (q: string) => {
    if (!q.trim()) {
      setSongs([]);
      setError("");
      return;
    }
    try {
      setSongs(await localLyricsProvider.search(q));
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }, []);

  const selectSong = React.useCallback(async (id: string) => {
    let cancelled = false;
    try {
      const data = await localLyricsProvider.fetchSong(id);
      if (cancelled) return;
      setSong(data);
      setSelectedId(id);
      setEditing(false);
      setError("");
      setSetting(LAST_SONG_KEY, id);
      const next: ProjectableItem[] = data.sections.map((s, i) => ({
        id: `${id}:${i}`,
        kind: "text",
        title: `${data.title} — ${s.label}`,
        body: s.body,
        ref: `${data.title} • ${s.label}`,
        category: "letra",
      }));
      setItems(next);
    } catch (e) {
      if (!cancelled) setError(message(e));
    }
    return () => {
      cancelled = true;
    };
  }, [setItems]);

  // Restaura última música (biblioteca inicia vazia até digitar).
  React.useEffect(() => {
    (async () => {
      const last = await getSetting(LAST_SONG_KEY);
      if (last) await selectSong(last);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQuery = (q: string) => {
    setQuery(q);
    reload(q);
  };

  const startNew = () => {
    setFormTitle("");
    setFormArtist("");
    setFormText("[Trecho 1]\n");
    setEditingId(null);
    setError("");
    setEditing(true);
  };

  const startEdit = () => {
    if (!song || !selectedId) return;
    setFormTitle(song.title);
    setFormArtist(song.artist);
    setFormText(serializeSections(song.sections));
    setEditingId(Number(selectedId));
    setError("");
    setEditing(true);
  };

  const handleSave = async () => {
    const title = formTitle.trim();
    if (!title) {
      setError("Informe o título da música.");
      return;
    }
    const sections = parseLyricsText(formText);
    if (sections.length === 0) {
      setError("Escreva ao menos um trecho da letra.");
      return;
    }
    try {
      const input = { title, artist: formArtist.trim(), sections };
      const id =
        editingId == null
          ? await createSong(input)
          : (await updateSong(editingId, input), editingId);
      setEditing(false);
      await reload(query);
      await selectSong(String(id));
    } catch (e) {
      setError(message(e));
    }
  };

  const addToRepertoire = React.useCallback(
    (entry: LyricsSearchResult) => {
      setRepertoire((prev) => [
        ...prev,
        {
          entryId: `${entry.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          songId: entry.id,
          title: entry.title,
          artist: entry.artist,
        },
      ]);
    },
    [],
  );

  const removeFromRepertoire = React.useCallback((entryId: string) => {
    setRepertoire((prev) => prev.filter((e) => e.entryId !== entryId));
  }, []);

  const moveRepertoire = React.useCallback((entryId: string, dir: -1 | 1) => {
    setRepertoire((prev) => {
      const idx = prev.findIndex((e) => e.entryId === entryId);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[nextIdx];
      next[nextIdx] = tmp;
      return next;
    });
  }, []);

  const clearRepertoire = React.useCallback(() => {
    setRepertoire([]);
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-4 text-sm text-muted-foreground lg:px-6">
        Carregando letras…
      </div>
    );
  }

  return (
    <div
      className={`grid min-h-0 flex-1 grid-cols-1 gap-3 px-4 py-4 lg:px-6 ${bibliotecaCollapsed ? "lg:grid-cols-[48px_300px_1fr]" : "lg:grid-cols-[280px_300px_1fr]"}`}
    >
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader
          className={`flex flex-row items-center gap-2 space-y-0 pb-2 ${bibliotecaCollapsed ? "justify-center" : "justify-between"}`}
        >
          {!bibliotecaCollapsed ? (
            <>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">Biblioteca</CardTitle>
                <CardDescription className="sr-only">Buscar na biblioteca</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={() => setBibliotecaCollapsed(true)}
                aria-label="Minimizar biblioteca"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setBibliotecaCollapsed(false)}
              aria-label="Expandir biblioteca"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        {!bibliotecaCollapsed ? (
          <>
            <div className="px-6 pb-2">
              <Input
                value={query}
                placeholder="Buscar título ou artista…"
                onChange={(e) => handleQuery(e.target.value)}
              />
            </div>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
              <Button onClick={startNew} className="shrink-0">
                + Nova música
              </Button>
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-1">
                  {songs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {!query.trim()
                        ? "Digite para buscar na biblioteca."
                        : "Nenhum resultado. Tente outro termo ou clique em “Nova música”."}
                    </p>
                  ) : (
                    songs.map((s) => (
                      <div
                        key={s.id}
                        ref={s.id === selectedId ? bibliotecaSelectedRef : null}
                        className="flex gap-1"
                      >
                        <Button
                          variant={s.id === selectedId ? "secondary" : "ghost"}
                          className="h-auto min-w-0 flex-1 shrink flex-col items-start whitespace-normal py-2 text-left"
                          onClick={() => selectSong(s.id)}
                        >
                          <span className="text-sm font-semibold">{s.title}</span>
                          {s.artist ? (
                            <span className="text-xs text-muted-foreground">
                              {s.artist}
                            </span>
                          ) : null}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 self-center px-2"
                          onClick={() => addToRepertoire(s)}
                          aria-label={`Adicionar ${s.title} ao repertório`}
                        >
                          +
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </>
        ) : (
          <CardContent className="flex flex-1 flex-col items-center gap-2 pt-0">
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground [writing-mode:vertical-lr]">
              BIBLIOTECA
            </span>
          </CardContent>
        )}
      </Card>

      <Card className="flex min-h-0 flex-col">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Repertório</CardTitle>
              <CardDescription>
                {repertoire.length === 0
                  ? "Pesquise na biblioteca e adicione músicas."
                  : `${repertoire.length} música(s) — em memória`}
              </CardDescription>
            </div>
            {repertoire.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearRepertoire}>
                Limpar
              </Button>
            ) : null}
          </div>
          <div className="pt-2">
            <Input
              placeholder="Pesquisar no repertório…"
              value={repertoireQuery}
              onChange={(e) => setRepertoireQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1">
              {repertoire.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  Nenhuma música no repertório. Use “+” na biblioteca ou “+ Repertório” na música aberta.
                </p>
              ) : (
                (() => {
                  const q = repertoireQuery.toLowerCase().trim();
                  const filtered = q
                    ? repertoire.filter(
                        (e) =>
                          e.title.toLowerCase().includes(q) ||
                          e.artist.toLowerCase().includes(q),
                      )
                    : repertoire;
                  if (filtered.length === 0) {
                    return (
                      <p className="p-2 text-sm text-muted-foreground">
                        Nenhum resultado para “{repertoireQuery}”.
                      </p>
                    );
                  }
                  return filtered.map((entry) => {
                    const idx = repertoire.indexOf(entry);
                    const isSelected = entry.songId === selectedId;
                    return (
                      <div
                        key={entry.entryId}
                        ref={isSelected ? repertorioSelectedRef : null}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm ${isSelected ? "bg-accent" : ""}`}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left"
                          onClick={() => selectSong(entry.songId)}
                        >
                          <span className="block truncate text-sm font-medium">
                            {idx + 1}. {entry.title}
                          </span>
                          {entry.artist ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {entry.artist}
                            </span>
                          ) : null}
                        </button>
                        <div className="flex shrink-0 gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={idx === 0}
                            onClick={() => moveRepertoire(entry.entryId, -1)}
                            aria-label="Mover para cima"
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={idx === repertoire.length - 1}
                            onClick={() => moveRepertoire(entry.entryId, 1)}
                            aria-label="Mover para baixo"
                          >
                            ↓
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => removeFromRepertoire(entry.entryId)}
                            aria-label="Remover do repertório"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex min-h-0 flex-col">
        {error ? (
          <p className="mb-2 text-sm text-destructive">{error}</p>
        ) : null}
        {editing ? (
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <CardTitle>
                {editingId == null ? "Nova música" : "Editar música"}
              </CardTitle>
              <CardDescription>
                Separe os trechos com uma linha em branco. Use{" "}
                <code>[Rótulo]</code> na primeira linha para nomear o trecho
                (ex.: [Verso 1], [Refrão]).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="song-title">Título</Label>
                  <Input
                    id="song-title"
                    value={formTitle}
                    placeholder="Ex.: Quão Grande É o Meu Deus"
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="song-artist">Artista / ministério</Label>
                  <Input
                    id="song-artist"
                    value={formArtist}
                    placeholder="Ex.: Soraya Moraes"
                    onChange={(e) => setFormArtist(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="song-text">Letra</Label>
                <textarea
                  id="song-text"
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder={"[Verso 1]\nLinha 1\nLinha 2\n\n[Refrão]\n…"}
                  className="min-h-48 w-full flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave}>Salvar</Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : song ? (
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>{song.title}</CardTitle>
                  {song.artist ? (
                    <CardDescription>{song.artist}</CardDescription>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={startEdit}>
                    Editar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-1">
                  {items.map((item, i) => (
                    <Button
                      key={item.id}
                      ref={i === selectedIndex ? trechoSelectedRef : null}
                      variant={i === selectedIndex ? "secondary" : "ghost"}
                      className="h-auto shrink-0 flex-col items-start whitespace-normal py-2 text-left"
                      onClick={() => selectIndex(i)}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {item.ref?.split("•")[1]?.trim() ?? `Trecho ${i + 1}`}
                      </span>
                      <span className="text-sm leading-relaxed whitespace-pre-line">
                        {item.body}
                      </span>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Letras</CardTitle>
              <CardDescription>
                Selecione uma música na biblioteca ou cadastre uma nova. Cada
                trecho vira um item navegável com Anterior/Próximo e projetável
                com Projetar.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
