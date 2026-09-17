import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, Key } from "lucide-react";
import { remoteGetStatus, remoteStart } from "@/features/remote/remote-api";

/** Controle remoto: servidor sobe sozinho no boot — aqui só QR + PIN, sem botões. */
export function RemoteControlCard() {
  const [status, setStatus] = React.useState<{
    running: boolean;
    ip: string;
    port: number;
    url: string;
    pin: string;
    has_pin: boolean;
  } | null>(null);
  const [failed, setFailed] = React.useState(false);

  // Servidor em pé por padrão: garante ligado ao abrir a tela.
  React.useEffect(() => {
    (async () => {
      try {
        const s = await remoteGetStatus();
        setStatus(s.running ? s : await remoteStart());
      } catch (e) {
        console.error("Erro ao iniciar controle remoto:", e);
        setFailed(true);
      }
    })();
  }, []);

  if (!status && !failed) return null;
  const running = status?.running ?? false;

  return (
    <Card className="shrink-0">
      <CardHeader className="space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-medium">Controle Remoto</CardTitle>
          <CardDescription>
            Gerencie o acesso via celular na LAN.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        {status?.has_pin ? (
          <div className={`flex flex-col items-center gap-4 p-4 rounded-lg transition-opacity ${running ? "bg-muted" : "bg-muted/40 opacity-60"}`}>
            <div className="bg-white p-2 rounded-sm">
              <QRCodeSVG value={status.url} size={160} />
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="h-4 w-4" />
                <span>Acesse via celular</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono bg-background px-2 py-1 rounded border">
                <Key className="h-3 w-3 text-muted-foreground" />
                <span>PIN: {status.pin}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-[200px]">
              Aponte a câmera para o QR Code ou digite o PIN no celular.
            </p>
          </div>
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            Não foi possível iniciar o servidor.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
