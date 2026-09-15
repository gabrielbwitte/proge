import * as React from "react";
import { BibleApiError, fetchTranslations, type ApiTranslation } from "./api";
import {
  countVerses,
  deleteVersion,
  listVersions,
  type BibleVersionRow,
} from "./bible-repo";
import { downloadVersion, type DownloadPhase } from "./download";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface VersionStatus extends ApiTranslation {
  downloaded: boolean;
  localCount: number;
}

/** Mostra a causa real em vez de engolir o erro com mensagem genérica. */
function describeError(e: unknown, fallback: string): string {
  if (e instanceof BibleApiError) return e.message;
  if (e instanceof Error && e.message) return `${fallback} Causa: ${e.message}`;
  try {
    const serialized = JSON.stringify(e);
    if (serialized && serialized !== "{}" && serialized !== "null") {
      return `${fallback} Causa: ${serialized}`;
    }
  } catch {
    // ignora erro de serialização, usa String() abaixo
  }
  const text = String(e);
  if (text && text !== "[object Object]" && text !== "undefined") {
    return `${fallback} Causa: ${text}`;
  }
  return fallback;
}

const PHASE_LABELS: Record<DownloadPhase, string> = {
  books: "Lendo catálogo de livros…",
  fetch: "Baixando tradução completa…",
  save: "",
  finish: "Concluído.",
};

export function BibleSettings() {
  const [remote, setRemote] = React.useState<VersionStatus[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{
    phase: DownloadPhase;
    done: number;
    total: number;
    book: string;
  }>({ phase: "books", done: 0, total: 0, book: "" });
  const cancelRef = React.useRef(false);

  const refreshList = React.useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const [translations, local] = await Promise.all([
        fetchTranslations(),
        listVersions(),
      ]);
      const localMap = new Map<string, BibleVersionRow>(
        local.map((v) => [v.version, v]),
      );
      const merged: VersionStatus[] = await Promise.all(
        translations.map(async (t) => ({
          ...t,
          downloaded: localMap.has(t.short_name),
          localCount:
            localMap.get(t.short_name)?.verse_count ??
            (await countVerses(t.short_name)),
        })),
      );
        setRemote(merged);
      } catch (e) {
        console.error("[Bíblia] falha ao listar versões:", e);
        setError(describeError(e, "Não foi possível listar as versões."));
      } finally {
        setLoadingList(false);
      }
  }, []);

  React.useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleDownload = async (t: ApiTranslation) => {
    cancelRef.current = false;
    setDownloading(t.short_name);
    setError("");
    setProgress({ phase: "books", done: 0, total: 0, book: "" });
    try {
      const result = await downloadVersion(
        t.short_name,
        t.full_name,
        (p) =>
          setProgress({
            phase: p.phase,
            done: p.doneChapters,
            total: p.totalChapters,
            book: p.currentBook,
          }),
        () => cancelRef.current,
      );
      if (result.status === "done") await refreshList();
    } catch (e) {
      console.error(`[Bíblia] falha ao baixar ${t.short_name}:`, e);
      setError(describeError(e, `Falha ao baixar ${t.short_name}.`));
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (shortName: string) => {
    try {
      await deleteVersion(shortName);
      await refreshList();
    } catch {
      setError(`Falha ao apagar ${shortName}.`);
    }
  };

  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card className="flex h-full min-h-0 flex-1 flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>Bíblia (Bolls.life)</CardTitle>
        <CardDescription>
          Baixe versões evangélicas em português (Almeida RA, RC, ACF, NAA…)
          para usar offline. Sem token e sem cadastro.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            disabled={loadingList || downloading !== null}
            onClick={() => refreshList()}
          >
            {loadingList ? "Listando…" : "Recarregar lista"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ScrollArea className="h-full min-h-0 w-full flex-1">
          <div className="flex flex-col gap-4 pr-3">
            {remote.map((v) => (
              <div
                key={v.short_name}
                className="flex flex-wrap items-center gap-3 rounded-md border p-3"
              >
              <div className="min-w-40 flex-1">
                <p className="text-sm font-semibold">
                  {v.full_name}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({v.short_name})
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {v.downloaded
                    ? `Baixada ✓ (${v.localCount} versículos)`
                    : v.localCount > 0
                      ? `Parcial (${v.localCount} versículos) — retoma de onde parou`
                      : "Ainda não baixada"}
                </p>
                {downloading === v.short_name ? (
                  <div className="mt-2">
                    <div className="h-2 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-green-700 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {progress.phase === "save" && progress.total > 0
                        ? `${pct}% — ${progress.done}/${progress.total} capítulos`
                        : PHASE_LABELS[progress.phase]}
                      {progress.book ? ` · ${progress.book}` : ""}
                    </p>
                  </div>
                ) : null}
              </div>
              {downloading === v.short_name ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  Cancelar
                </Button>
              ) : v.downloaded ? (
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(v.short_name)}
                >
                  Apagar
                </Button>
              ) : (
                <Button
                  disabled={downloading !== null}
                  onClick={() => handleDownload(v)}
                >
                {v.localCount > 0 ? "Continuar" : "Baixar"}
              </Button>
              )}
            </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
