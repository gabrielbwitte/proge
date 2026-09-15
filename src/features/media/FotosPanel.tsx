import * as React from "react";
import { useProjection } from "../projection/store";
import type { ProjectableItem } from "../projection/types";
import { listMedia, resolveAssetUrl } from "./media-repo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "cn";

export function FotosPanel() {
  const { items, selectedIndex, setItems, selectIndex } = useProjection();
  const [dir, setDir] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const selectedRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, items]);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { dir: found, files } = await listMedia("photos");
      setDir(found);
      const next: ProjectableItem[] = files.map((f) => ({
        id: f.path,
        kind: "image",
        title: f.name,
        body: f.name,
        mediaUrl: resolveAssetUrl(f.path),
      }));
      setItems(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler a pasta.");
    } finally {
      setLoading(false);
    }
  }, [setItems]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="px-4 py-4 text-sm text-muted-foreground lg:px-6">
        Lendo pasta de fotos…
      </div>
    );
  }

  if (error || !dir) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 py-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Fotos</CardTitle>
            <CardDescription>
              {error ||
                "Nenhuma pasta configurada. Vá em Configuração → Mídia e escolha a pasta de fotos."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 lg:px-6">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">
          {dir} · {items.length} {items.length === 1 ? "foto" : "fotos"}
        </p>
        <Button variant="secondary" size="sm" onClick={reload}>
          Recarregar
        </Button>
      </div>
      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma foto encontrada</CardTitle>
            <CardDescription>
              Formatos aceitos: JPG, PNG, GIF, WebP, BMP, SVG.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <div className="grid auto-rows-min grid-cols-3 gap-2 p-2 sm:grid-cols-4 lg:grid-cols-6">
            {items.map((item, i) => (
              <button
                key={item.id}
                ref={i === selectedIndex ? selectedRef : null}
                type="button"
                title={item.title}
                onClick={() => selectIndex(i)}
                className={cn(
                  "group relative aspect-video overflow-hidden rounded-md border bg-muted outline-none transition focus-visible:border-ring",
                  i === selectedIndex &&
                    "border-transparent ring-2 ring-green-700",
                )}
              >
                {item.mediaUrl ? (
                  <img
                    src={item.mediaUrl}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-left text-[11px] text-white">
                  {item.title}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
