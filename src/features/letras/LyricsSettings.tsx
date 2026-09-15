import * as React from "react";
import { LyricsApiError, type RemoteHit } from "./api";
import { searchLyrics, fetchLyric } from "./api";
import { parseLyricsText } from "./provider";
import { createSong, findRemoteSong, listDownloadedRemoteIds } from "./songs-repo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

function SourceBadge({ source }: { source: RemoteHit["source"] }) {
  return source === "louvorja"
    ? <Badge variant="secondary">Harpa</Badge>
    : <Badge variant="outline">LRCLIB</Badge>;
}

function describeError(e: unknown, fallback: string): string {
  if (e instanceof LyricsApiError) return e.message;
  if (e instanceof Error && e.message) return `${fallback} Causa: ${e.message}`;
  return fallback;
}

export function LyricsSettings() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<RemoteHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [downloaded, setDownloaded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    listDownloadedRemoteIds().then(setDownloaded);
  }, []);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    try {
      const hits = await searchLyrics(q);
      setResults(hits);
      if (hits.length === 0) setError(`Nenhum resultado para "${q}".`);
    } catch (e) {
      setError(describeError(e, "Falha na pesquisa."));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (hit: RemoteHit) => {
    const key = `${hit.source}:${hit.fetchKey}`;
    if (downloaded.has(key)) return;
    setDownloading(key);
    setError("");
    try {
      const existing = await findRemoteSong(hit.source, hit.fetchKey);
      if (existing != null) {
        setDownloaded((prev) => new Set(prev).add(key));
        return;
      }
      const { title, artist, text } = await fetchLyric(hit);
      const sections = parseLyricsText(text);
      if (sections.length === 0) throw new LyricsApiError(-1, "Letra vazia.");
      await createSong({ title, artist, sections, source: hit.source, externalId: hit.fetchKey });
      setDownloaded((prev) => new Set(prev).add(key));
    } catch (e) {
      setError(describeError(e, `Falha ao baixar "${hit.title}".`));
    } finally {
      setDownloading(null);
    }
  };

  const isDownloaded = (hit: RemoteHit) => downloaded.has(`${hit.source}:${hit.fetchKey}`);

  return (
    <Card className="flex h-full min-h-0 flex-1 flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>Letras gospel — buscar online</CardTitle>
        <CardDescription>
          Pesquisa em LouvorJA (harpa/hinário BR) + LRCLIB (global), sem token nem cadastro. Cada resultado pode ser baixado para o SQLite e aparece no módulo Letras.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 gap-2">
          <Input
            value={query}
            placeholder="Ex.: Ressuscita - Aline Barros"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="max-w-md"
          />
          <Button disabled={loading || !query.trim()} onClick={handleSearch}>
            {loading ? "Pesquisando…" : "Pesquisar"}
          </Button>
        </div>
        {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
        <ScrollArea className="h-full min-h-0 w-full flex-1 rounded-md border">
          <div className="flex flex-col gap-2 p-2">
            {results.length === 0 && !loading ? (
              <p className="p-2 text-sm text-muted-foreground">
                Digite um termo e clique em Pesquisar.
              </p>
            ) : (
              results.map((hit) => {
                const key = `${hit.source}:${hit.fetchKey}`;
                const done = isDownloaded(hit);
                const busy = downloading === key;
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-40 flex-1">
                      <p className="text-sm font-semibold">{hit.title}</p>
                      <p className="text-xs text-muted-foreground">{hit.artist}</p>
                    </div>
                    <SourceBadge source={hit.source} />
                    <Button
                      size="sm"
                      disabled={done || busy}
                      variant={done ? "secondary" : "default"}
                      onClick={() => handleDownload(hit)}
                    >
                      {done ? "Baixada ✓" : busy ? "Baixando…" : "Baixar"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
