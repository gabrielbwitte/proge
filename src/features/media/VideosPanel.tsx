import * as React from "react";
import { useProjection } from "../projection/store";
import type { ProjectableItem } from "../projection/types";
import {
  fileSize,
  formatSize,
  getVideoPrefs,
  listMedia,
  resolveAssetUrl,
} from "./media-repo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Amostragem de ~200 pixels: true se o frame for (quase) todo preto. */
function frameIsBlack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    const stride = Math.max(1, Math.floor(data.length / 4 / 200));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += stride * 4) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      n += 1;
    }
    return n > 0 && sum / n < 10;
  } catch {
    return false;
  }
}

/**
 * Miniatura com o primeiro frame capturado via canvas (seek explícito).
 * O <video> puro nem sempre pinta o frame sozinho no webview.
 */
function VideoThumb({ src, title }: { src?: string; title: string }) {
  const [thumb, setThumb] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!src) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let settled = false;
    let attempts = 0;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    const fail = () => {
      if (!cancelled && !settled) {
        settled = true;
        setFailed(true);
        cleanup();
      }
    };

    const capture = () => {
      if (cancelled || settled) return;
      try {
        // Sem dados decodificados ainda: tenta de novo no próximo frame
        // em vez de congelar preto.
        if (!video.videoWidth || video.readyState < 2) {
          requestAnimationFrame(() => capture());
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          fail();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Frame (quase) todo preto = fade-in ou seek adiantado:
        // avança e tenta de novo em vez de aceitar o preto.
        if (frameIsBlack(ctx, canvas.width, canvas.height) && attempts < 5) {
          attempts += 1;
          const dur = video.duration;
          const next = Number.isFinite(dur)
            ? Math.min(video.currentTime + 0.5, Math.max(0, dur - 0.1))
            : video.currentTime + 0.5;
          if (Math.abs(next - video.currentTime) > 0.01) {
            video.currentTime = next; // 'seeked' retoma via settleAndCapture
            return;
          }
        }
        settled = true;
        done();
        setThumb(canvas.toDataURL("image/jpeg", 0.6));
        cleanup();
      } catch {
        fail();
      }
    };

    const timer = window.setTimeout(fail, 10000);
    const done = () => window.clearTimeout(timer);

    video.addEventListener("error", () => {
      done();
      fail();
    });
    // Só busca depois que há dados decodificáveis (canplay),
    // e só captura após 2 frames de animação pós-seek:
    // sem isso o canvas congela um frame ainda preto.
    video.addEventListener("canplay", () => {
      try {
        const target = Number.isFinite(video.duration)
          ? Math.min(0.5, video.duration / 2)
          : 0.1;
        if (Math.abs(video.currentTime - target) < 0.01) {
          done();
          settleAndCapture();
        } else {
          video.currentTime = target;
        }
      } catch {
        done();
        capture();
      }
    });
    video.addEventListener("seeked", () => {
      done();
      settleAndCapture();
    });

    function settleAndCapture() {
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          capture();
        });
      });
    }

    video.src = src;
    video.load();

    return () => {
      cancelled = true;
      done();
      cleanup();
    };
  }, [src]);

  return (
    <span className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-xs font-semibold">
      {thumb && !failed ? (
        <img src={thumb} alt={title} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>▶</span>
      )}
    </span>
  );
}

export function VideosPanel() {
  const { items, selectedIndex, setItems, selectIndex } = useProjection();
  const [dir, setDir] = React.useState("");
  const [sizes, setSizes] = React.useState<Record<string, number>>({});
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
      const [{ dir: found, files }, prefs] = await Promise.all([
        listMedia("videos"),
        getVideoPrefs(),
      ]);
      setDir(found);
      const next: ProjectableItem[] = files.map((f) => ({
        id: f.path,
        kind: "video",
        title: f.name,
        body: f.name,
        mediaUrl: resolveAssetUrl(f.path),
        videoOpts: { loop: prefs.loop, muted: prefs.muted },
      }));
      setItems(next);
      // Tamanhos em segundo plano, sem bloquear a lista.
      Promise.all(
        files.map(async (f) => ({ path: f.path, size: await fileSize(f.path) })),
      ).then((entries) => {
        const map: Record<string, number> = {};
        for (const e of entries) {
          if (e.size != null) map[e.path] = e.size;
        }
        setSizes(map);
      });
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
        Lendo pasta de vídeos…
      </div>
    );
  }

  if (error || !dir) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 py-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Vídeos</CardTitle>
            <CardDescription>
              {error ||
                "Nenhuma pasta configurada. Vá em Configuração → Mídia e escolha a pasta de vídeos."}
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
          {dir} · {items.length} {items.length === 1 ? "vídeo" : "vídeos"} ·
          projeta com autoplay
        </p>
        <Button variant="secondary" size="sm" onClick={reload}>
          Recarregar
        </Button>
      </div>
      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum vídeo encontrado</CardTitle>
            <CardDescription>
              Formatos aceitos: MP4, WebM, MKV, MOV, AVI, M4V.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <div className="flex flex-col gap-1 p-2">
            {items.map((item, i) => (
              <Button
                key={item.id}
                ref={i === selectedIndex ? selectedRef : null}
                variant={i === selectedIndex ? "secondary" : "ghost"}
                className="h-auto shrink-0 items-center justify-start gap-3 whitespace-normal py-2 text-left"
                onClick={() => selectIndex(i)}
              >
              <VideoThumb src={item.mediaUrl} title={item.title} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.title}
                  </span>
                  {sizes[item.id] != null ? (
                    <span className="block text-xs text-muted-foreground">
                      {formatSize(sizes[item.id])}
                    </span>
                  ) : null}
                </span>
              </Button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
