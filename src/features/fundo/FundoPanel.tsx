import * as React from "react";
import { getWallpapers, setWallpaper } from "./fundo-repo";
import { listMedia, resolveAssetUrl } from "../media/media-repo";
import { emitWallpapers } from "../projection/events";
import type { FundoCategory, FundoWallpapers } from "../projection/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";

const TAB_LABELS: Record<FundoCategory, string> = {
  padrao: "Padrão",
  biblia: "Bíblia",
  letra: "Letra",
};

const TAB_DESCRIPTIONS: Record<FundoCategory, string> = {
  padrao: "Exibido quando o telão está limpo.",
  biblia: "Exibido ao projetar versículos.",
  letra: "Exibido ao projetar letras.",
};

function WallpaperTab({
  category,
  currentPath,
  disabled,
  onSelect,
}: {
  category: FundoCategory;
  currentPath: string | undefined;
  disabled: boolean;
  onSelect: (path: string | null) => void;
}) {
  const [dir, setDir] = React.useState("");
  const [files, setFiles] = React.useState<{ path: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { dir: found, files: list } = await listMedia("photos");
        if (cancelled) return;
        setDir(found);
        setFiles(list);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Falha ao ler a pasta.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewUrl = currentPath ? (() => { try { return resolveAssetUrl(currentPath); } catch { return undefined; } })() : undefined;

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Lendo pasta de Fotos…</p>;
  }

  if (error || !dir) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{TAB_LABELS[category]}</CardTitle>
          <CardDescription>
            {error || "Nenhuma pasta de Fotos configurada. Vá em Configuração → Mídia e escolha a pasta de Fotos. O Fundo usa as mesmas imagens."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{TAB_LABELS[category]}</CardTitle>
          <CardDescription>Nenhuma imagem encontrada na pasta Fotos ({dir}).</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <Card className="shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{TAB_LABELS[category]}</CardTitle>
          <CardDescription>{TAB_DESCRIPTIONS[category]}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <div className="h-20 w-32 shrink-0 overflow-hidden rounded-md border bg-muted">
            {previewUrl ? (
              <img src={previewUrl} alt={`Wallpaper ${TAB_LABELS[category]}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">Nenhum</div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="truncate text-xs text-muted-foreground" title={currentPath}>{currentPath ?? "Nenhum wallpaper selecionado"}</span>
            <div className="flex gap-2">
              {currentPath ? (
                <Button variant="outline" size="sm" disabled={disabled} onClick={() => onSelect(null)}>
                  Remover
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground self-center">Toque numa imagem abaixo para selecionar</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <p className="shrink-0 text-sm font-medium">
          Escolha da pasta Fotos <span className="font-normal text-muted-foreground">· {files.length} em {dir}</span>
        </p>
        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <div className="grid auto-rows-min grid-cols-3 gap-2 p-2 sm:grid-cols-4 lg:grid-cols-5">
            {files.map((f) => {
              const isSelected = f.path === currentPath;
              let thumb: string | undefined;
              try {
                thumb = resolveAssetUrl(f.path);
              } catch {
                thumb = undefined;
              }
              return (
                <button
                  key={f.path}
                  type="button"
                  title={f.name}
                  disabled={disabled}
                  onClick={() => onSelect(f.path)}
                  className={cn(
                    "group relative aspect-video overflow-hidden rounded-md border bg-muted outline-none transition focus-visible:border-ring",
                    isSelected && "border-transparent ring-2 ring-green-700",
                  )}
                >
                  {thumb ? (
                    <img src={thumb} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-left text-[11px] text-white">
                    {isSelected ? "✓ " : ""}
                    {f.name}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export function FundoPanel() {
  const [wallpapers, setWallpapers] = React.useState<FundoWallpapers>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    getWallpapers().then((w) => {
      setWallpapers(w);
      setLoading(false);
      void emitWallpapers(w);
    });
  }, []);

  const handleSelect = async (category: FundoCategory, path: string | null) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const next = await setWallpaper(category, path);
      setWallpapers(next);
      // Local (operador) + telões (Tauri event + BroadcastChannel).
      await emitWallpapers(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar o fundo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="px-4 py-4 text-sm text-muted-foreground lg:px-6">Carregando fundos…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4 lg:px-6">
      {error ? (
        <p className="shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saving ? (
        <p className="shrink-0 text-sm text-muted-foreground">Salvando fundo…</p>
      ) : null}
      <Tabs defaultValue="padrao" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList className="shrink-0">
          <TabsTrigger value="padrao">Padrão</TabsTrigger>
          <TabsTrigger value="biblia">Bíblia</TabsTrigger>
          <TabsTrigger value="letra">Letra</TabsTrigger>
        </TabsList>
        <TabsContent value="padrao" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <WallpaperTab category="padrao" currentPath={wallpapers.padrao} disabled={saving} onSelect={(p) => handleSelect("padrao", p)} />
        </TabsContent>
        <TabsContent value="biblia" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <WallpaperTab category="biblia" currentPath={wallpapers.biblia} disabled={saving} onSelect={(p) => handleSelect("biblia", p)} />
        </TabsContent>
        <TabsContent value="letra" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <WallpaperTab category="letra" currentPath={wallpapers.letra} disabled={saving} onSelect={(p) => handleSelect("letra", p)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
