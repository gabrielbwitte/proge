import * as React from "react";
import { getWallpapers } from "../fundo/fundo-repo";
import { resolveAssetUrl } from "../media/media-repo";
import { subscribeStage } from "../projection/events";
import { DEFAULT_STAGE_THEME, type FundoWallpapers, type ProjectPayload } from "../projection/types";

/**
 * Janela de saída (telão/TV/projetor), fullscreen.
 * Só muda via eventos `proge:project` / `proge:clear` vindos do operador.
 */
export function StageView() {
  const [payload, setPayload] = React.useState<ProjectPayload | null>(null);
  const [live, setLive] = React.useState(false);
  const [wallpapers, setWallpapers] = React.useState<FundoWallpapers>({});

  React.useEffect(() => {
    getWallpapers().then(setWallpapers);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<FundoWallpapers>).detail;
      if (detail && typeof detail === "object") setWallpapers(detail);
    };
    window.addEventListener("fundo:wallpapers", handler as EventListener);
    return () => window.removeEventListener("fundo:wallpapers", handler as EventListener);
  }, []);

  React.useEffect(() => {
    let unlisten: (() => void) | null = null;
    subscribeStage(
      (p) => {
        setPayload(p);
        setLive(true);
      },
      () => setLive(false),
    ).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, []);

  const theme = payload?.theme ?? DEFAULT_STAGE_THEME;
  const idleBg = wallpapers.padrao ? (() => { try { return resolveAssetUrl(wallpapers.padrao); } catch { return undefined; } })() : undefined;
  const backgroundImage = theme.backgroundImage ?? (!live ? idleBg : undefined);
  const stageStyle: React.CSSProperties = {
    background: theme.background,
    color: theme.foreground,
    ...(backgroundImage
      ? {
          backgroundImage: `url("${backgroundImage}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : {}),
  };

  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center overflow-hidden p-12 text-center"
      style={stageStyle}
    >
      {!live || !payload || payload.kind === "blank" ? (
        <div className="flex flex-col items-center gap-3 opacity-40">
          <span className="text-2xl font-semibold tracking-wide">Proge</span>
          <span className="text-sm">Aguardando projeção…</span>
        </div>
      ) : payload.kind === "image" && payload.mediaUrl ? (
        <img
          src={payload.mediaUrl}
          alt={payload.title}
          className="max-h-full max-w-full object-contain"
        />
      ) : payload.kind === "video" && payload.mediaUrl ? (
        <video
          key={`${payload.mediaUrl}|${payload.videoOpts?.loop}|${payload.videoOpts?.muted}`}
          src={payload.mediaUrl}
          className="max-h-full max-w-full"
          autoPlay
          loop={payload.videoOpts?.loop ?? true}
          muted={payload.videoOpts?.muted ?? false}
          controls={false}
        />
      ) : (
        <div className="flex max-w-6xl flex-col items-center gap-6">
          {payload.ref ? (
            <span className="text-2xl font-medium uppercase tracking-widest opacity-70">
              {payload.ref}
            </span>
          ) : null}
          <p
            className="font-semibold leading-tight"
            style={{ fontSize: theme.fontSize }}
          >
            {payload.body}
          </p>
          {payload.title && payload.title !== payload.body ? (
            <span className="text-xl opacity-70">{payload.title}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
