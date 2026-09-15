import * as React from "react";
import {
  checkForUpdates,
  getAppVersion,
  openRelease,
  type UpdateInfo,
} from "./updates";
import {
  describeUpdaterError,
  downloadInstallAndRelaunch,
  type InstallProgress,
} from "./updater";
import { isTauri } from "@/lib/tauri";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type Status =
  | { kind: "idle"; version: string }
  | { kind: "checking" }
  | { kind: "done"; info: UpdateInfo }
  | { kind: "downloading"; info: UpdateInfo; progress: InstallProgress }
  | { kind: "installing"; info: UpdateInfo }
  | { kind: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

export function UpdateCard() {
  const [status, setStatus] = React.useState<Status>({ kind: "idle", version: "" });
  const native = isTauri();

  React.useEffect(() => {
    getAppVersion().then((version) => setStatus({ kind: "idle", version }));
  }, []);

  const currentVersion =
    status.kind === "idle"
      ? status.version
      : status.kind === "done" ||
          status.kind === "downloading" ||
          status.kind === "installing"
        ? status.info.current
        : "";

  const handleCheck = async () => {
    setStatus({ kind: "checking" });
    try {
      const info = await checkForUpdates();
      setStatus({ kind: "done", info });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Falha ao verificar.",
      });
    }
  };

  const handleInstall = async (info: UpdateInfo) => {
    setStatus({
      kind: "downloading",
      info,
      progress: { downloaded: 0, total: null },
    });
    try {
      await downloadInstallAndRelaunch((progress) =>
        setStatus({ kind: "downloading", info, progress }),
      );
      // No Windows o instalador encerra o app; no macOS/Linux o
      // relaunch() acima já reiniciou. Se chegou aqui, mostra instalando.
      setStatus({ kind: "installing", info });
    } catch (e) {
      setStatus({ kind: "error", message: describeUpdaterError(e) });
    }
  };

  const progressPercent =
    status.kind === "downloading" && status.progress.total
      ? Math.min(
          100,
          Math.round(
            (status.progress.downloaded / status.progress.total) * 100,
          ),
        )
      : null;

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>Atualizações</CardTitle>
        <CardDescription>
          Verifica a última release publicada no GitHub (gabrielbwitte/proge).
          {native
            ? " Ao clicar em atualizar, o app baixa, instala e reinicia sozinho."
            : " No navegador, o download é feito pela página da release."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Instalada: {currentVersion || "…"}
          </Badge>
          {status.kind === "done" ||
          status.kind === "downloading" ||
          status.kind === "installing" ? (
            status.info.updateAvailable ? (
              <Badge variant="destructive">Nova versão: {status.info.latest}</Badge>
            ) : (
              <Badge variant="secondary">Em dia ✓</Badge>
            )
          ) : null}
          <Button
            variant="secondary"
            disabled={
              status.kind === "checking" ||
              status.kind === "downloading" ||
              status.kind === "installing"
            }
            onClick={handleCheck}
          >
            {status.kind === "checking" ? "Verificando…" : "Verificar atualizações"}
          </Button>
        </div>
        {status.kind === "error" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-destructive">{status.message}</p>
            <div>
              <Button variant="outline" size="sm" onClick={handleCheck}>
                Tentar de novo
              </Button>
            </div>
          </div>
        ) : null}
        {status.kind === "downloading" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Baixando {status.info.latest}…{" "}
              {progressPercent !== null ? (
                <span className="font-medium">{progressPercent}%</span>
              ) : (
                <span className="text-muted-foreground">
                  {formatBytes(status.progress.downloaded)}
                </span>
              )}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-green-700 transition-all"
                style={{
                  width:
                    progressPercent !== null ? `${progressPercent}%` : "30%",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Não feche o app durante o download.
            </p>
          </div>
        ) : null}
        {status.kind === "installing" ? (
          <p className="text-sm">
            Instalando… o app vai reiniciar sozinho na nova versão.
          </p>
        ) : null}
        {status.kind === "done" && status.info.updateAvailable ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {status.info.notes ? (
              <ScrollArea className="max-h-48 rounded-md border">
                <p className="p-3 text-sm whitespace-pre-line">{status.info.notes}</p>
              </ScrollArea>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {native ? (
                <Button
                  className="bg-green-700 hover:bg-green-800"
                  onClick={() => handleInstall(status.info)}
                >
                  Baixar e instalar {status.info.latest}
                </Button>
              ) : null}
              <Button
                variant={native ? "outline" : "default"}
                onClick={() => openRelease(status.info.releaseUrl)}
              >
                Baixar {status.info.latest} no GitHub
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
