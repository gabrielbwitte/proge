import * as React from "react";
import {
  getMediaDir,
  getVideoPrefs,
  pickDirectory,
  setMediaDir,
  setVideoPrefs,
  type MediaKind,
  type VideoPrefs,
} from "./media-repo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function FolderRow({
  label,
  kind,
  path,
  onChanged,
}: {
  label: string;
  kind: MediaKind;
  path: string;
  onChanged: (path: string) => void;
}) {
  const [error, setError] = React.useState("");

  const choose = async () => {
    setError("");
    try {
      const picked = await pickDirectory(path || undefined);
      if (picked == null) return;
      const ok = await setMediaDir(kind, picked);
      if (ok) onChanged(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao escolher a pasta.");
    }
  };

  const clear = async () => {
    setError("");
    const ok = await setMediaDir(kind, "");
    if (ok) onChanged("");
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {path || "Nenhuma pasta escolhida"}
        </p>
        <Button variant="secondary" onClick={choose}>
          Escolher…
        </Button>
        {path ? (
          <Button variant="outline" onClick={clear}>
            Limpar
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function MediaSettings() {
  const [photosDir, setPhotosDir] = React.useState("");
  const [videosDir, setVideosDir] = React.useState("");
  const [prefs, setPrefs] = React.useState<VideoPrefs>({
    loop: true,
    muted: false,
  });

  React.useEffect(() => {
    (async () => {
      const [photos, videos, videoPrefs] = await Promise.all([
        getMediaDir("photos"),
        getMediaDir("videos"),
        getVideoPrefs(),
      ]);
      setPhotosDir(photos);
      setVideosDir(videos);
      setPrefs(videoPrefs);
    })();
  }, []);

  const updatePrefs = async (next: VideoPrefs) => {
    setPrefs(next);
    await setVideoPrefs(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mídia (fotos e vídeos)</CardTitle>
        <CardDescription>
          Pastas locais exibidas nos módulos de Fotos e Vídeos, e comportamento
          dos vídeos no telão.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FolderRow
          label="Pasta de fotos"
          kind="photos"
          path={photosDir}
          onChanged={setPhotosDir}
        />
        <FolderRow
          label="Pasta de vídeos"
          kind="videos"
          path={videosDir}
          onChanged={setVideosDir}
        />
        <div className="flex flex-col gap-3">
          <Label>Gerenciamento de vídeo (telão)</Label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={prefs.loop}
              onCheckedChange={(v) =>
                updatePrefs({ ...prefs, loop: v === true })
              }
            />
            Repetir o vídeo em loop
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={prefs.muted}
              onCheckedChange={(v) =>
                updatePrefs({ ...prefs, muted: v === true })
              }
            />
            Iniciar vídeos sem som
          </label>
          <p className="text-xs text-muted-foreground">
            Todo vídeo projetado começa sozinho (autoplay). “Limpar” para a
            exibição.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
