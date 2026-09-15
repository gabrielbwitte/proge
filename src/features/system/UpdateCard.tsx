import * as React from "react";
import {
  checkForUpdates,
  getAppVersion,
  openRelease,
  type UpdateInfo,
} from "./updates";
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
  | { kind: "error"; message: string };

export function UpdateCard() {
  const [status, setStatus] = React.useState<Status>({ kind: "idle", version: "" });

  React.useEffect(() => {
    getAppVersion().then((version) => setStatus({ kind: "idle", version }));
  }, []);

  const currentVersion =
    status.kind === "idle"
      ? status.version
      : status.kind === "done"
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

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>Atualizações</CardTitle>
        <CardDescription>
          Verifica a última release publicada no GitHub (gabrielwitte/proge).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Instalada: {currentVersion || "…"}
          </Badge>
          {status.kind === "done" ? (
            status.info.updateAvailable ? (
              <Badge variant="destructive">Nova versão: {status.info.latest}</Badge>
            ) : (
              <Badge variant="secondary">Em dia ✓</Badge>
            )
          ) : null}
          <Button
            variant="secondary"
            disabled={status.kind === "checking"}
            onClick={handleCheck}
          >
            {status.kind === "checking" ? "Verificando…" : "Verificar atualizações"}
          </Button>
        </div>
        {status.kind === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
        {status.kind === "done" && status.info.updateAvailable ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {status.info.notes ? (
              <ScrollArea className="max-h-48 rounded-md border">
                <p className="p-3 text-sm whitespace-pre-line">{status.info.notes}</p>
              </ScrollArea>
            ) : null}
            <div>
              <Button
                className="bg-green-700 hover:bg-green-800"
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
