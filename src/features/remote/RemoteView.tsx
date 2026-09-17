import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Loader2,
  Play,
  QrCode,
} from "lucide-react";
import {
  buildMarker,
  clearPin,
  connectRemoteWs,
  fetchRemoteState,
  mediaUrl,
  resolveApiBase,
  resolvePin,
  savePin,
  sendRemoteAction,
} from "./client";
import type { ModuleId } from "../projection/types";
import type { RemoteAction, RemoteStateSnapshot } from "./types";
import { BibleRemote } from "./BibleRemote";
import { SongsRemote } from "./SongsRemote";
import { InstallTip } from "./InstallTip";

type Phase =
  | { kind: "pin"; error?: string }
  | { kind: "connecting" }
  | { kind: "live"; snapshot: RemoteStateSnapshot; pin: string }
  | { kind: "error"; message: string };

const MODULES: { id: ModuleId; label: string }[] = [
  { id: "biblia", label: "Bíblia" },
  { id: "letras", label: "Letras" },
  { id: "fotos", label: "Fotos" },
  { id: "videos", label: "Vídeos" },
];

/** Página mobile do controle remoto (`#/remote`), servida pelo Axum na LAN. */
export function RemoteView() {
  const [phase, setPhase] = React.useState<Phase>(() => {
    const initial = resolvePin();
    return initial ? { kind: "connecting" } : { kind: "pin" };
  });
  const [pinInput, setPinInput] = React.useState("");
  const disconnectRef = React.useRef<(() => void) | null>(null);
  // Último PIN autenticado com sucesso — usado para reconectar e para
  // todas as ações da fase live (nunca re-ler da URL aqui: um `?pin=`
  // velho no hash sombrearia o PIN digitado e geraria 401).
  const lastPinRef = React.useRef<string>("");
  // Bíblia como módulo padrão: seleciona uma vez por carregamento da página.
  const didDefaultModuleRef = React.useRef(false);

  const disconnect = React.useCallback(() => {
    disconnectRef.current?.();
    disconnectRef.current = null;
  }, []);

  const connect = React.useCallback(async (pin: string) => {
    disconnect();
    setPhase({ kind: "connecting" });
    const base = resolveApiBase();
    try {
      const snapshot = await fetchRemoteState(base, pin);
      savePin(pin);
      lastPinRef.current = pin;
      setPhase({ kind: "live", snapshot, pin });
      disconnectRef.current = connectRemoteWs(
        base,
        pin,
        (state) => setPhase({ kind: "live", snapshot: state, pin }),
        () => setPhase({ kind: "error", message: "Conexão perdida. Verifique o Wi-Fi e reconecte." }),
      );
      if (!didDefaultModuleRef.current) {
        didDefaultModuleRef.current = true;
        // Módulo padrão: leva operador + celular para a Bíblia.
        sendRemoteAction(base, pin, { type: "module", module: "biblia" }).catch(() => {
          // melhor esforço: o operador pode já estar nela
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao conectar.";
      if (message.includes("PIN inválido")) {
        clearPin();
        setPhase({ kind: "pin", error: message });
      } else {
        setPhase({
          kind: "error",
          message: "Não foi possível alcançar o operador. Confira se o celular está no mesmo Wi-Fi e tente de novo.",
        });
      }
    }
  }, [disconnect]);

  // Trava o scroll do documento: só as listas internas rolam.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Autoconexão quando o PIN veio no QR.
  React.useEffect(() => {
    console.info(`[proge-remote] build ${buildMarker()}`);
    const initial = resolvePin();
    if (initial) void connect(initial);
    return () => disconnectRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(action: RemoteAction) {
    // Na fase live, o PIN é o que autenticou com sucesso — nunca
    // `resolvePin()` aqui (a URL pode conter um `?pin=` velho que
    // causava "PIN inválido" ao trocar de módulo).
    const pin =
      phase.kind === "live" ? phase.pin : lastPinRef.current || resolvePin();
    if (!pin) {
      setPhase({ kind: "pin", error: "Informe o PIN exibido no operador." });
      return;
    }
    try {
      await sendRemoteAction(resolveApiBase(), pin, action);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao enviar comando.";
      if (message.includes("PIN inválido")) {
        // PIN girado no operador: volta para a tela de PIN (limpa URL
        // junto via `clearPin`) em vez de travar na tela de erro.
        lastPinRef.current = "";
        clearPin();
        setPhase({ kind: "pin", error: message });
        return;
      }
      setPhase({
        kind: "error",
        message,
      });
    }
  }

  function submitPin(event: React.FormEvent) {
    event.preventDefault();
    const pin = pinInput.trim();
    if (!/^\d{4}$/.test(pin)) {
      setPhase({ kind: "pin", error: "O PIN tem 4 dígitos." });
      return;
    }
    savePin(pin);
    void connect(pin);
  }

  function logout() {
    disconnect();
    lastPinRef.current = "";
    clearPin();
    setPinInput("");
    setPhase({ kind: "pin" });
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-4 overflow-hidden overscroll-none bg-background px-4 py-6">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Proge Controle</h1>
        </div>
        {phase.kind === "live" ? (
          <Badge variant={phase.snapshot.live ? "destructive" : "secondary"}>
            {phase.snapshot.live ? "NO AR" : "tela limpa"}
          </Badge>
        ) : null}
      </header>

      {phase.kind === "pin" ? (
        <>
        <Card>
          <CardHeader>
            <CardTitle>Digite o PIN</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPin} className="flex flex-col gap-3">
              <Input
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="text-center text-3xl tracking-[0.5em]"
                aria-label="PIN de 4 dígitos"
              />
              {phase.error ? <p className="text-sm text-destructive">{phase.error}</p> : null}
              <Button type="submit" size="lg">
                Conectar
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                O PIN aparece em Configuração → Sistema, no operador. Escanear o QR preenche sozinho.
              </p>
            </form>
          </CardContent>
        </Card>
        <InstallTip />
        </>
      ) : null}

      {phase.kind === "connecting" ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Conectando…
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="text-sm text-destructive">{phase.message}</p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const pin = lastPinRef.current || resolvePin();
                  if (pin) void connect(pin);
                  else setPhase({ kind: "pin" });
                }}
              >
                Reconectar
              </Button>
              <Button variant="outline" onClick={logout}>
                Trocar PIN
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase.kind === "live" ? (
        <>
          <div className="grid shrink-0 grid-cols-4 gap-2">
            {MODULES.map((m) => (
              <Button
                key={m.id}
                variant={phase.snapshot.module === m.id ? "default" : "outline"}
                size="sm"
                onClick={() => void act({ type: "module", module: m.id })}
              >
                {m.label}
              </Button>
            ))}
          </div>

          <Card className="flex min-h-0 flex-1 flex-col">
            {phase.snapshot.module === "biblia" ||
            phase.snapshot.module === "letras" ? null : (
              <CardHeader className="shrink-0 pb-2">
                <CardTitle className="text-base">
                  {currentTitle(phase.snapshot)}
                </CardTitle>
              </CardHeader>
            )}
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {phase.snapshot.module === "biblia" ? (
                <BibleRemote snapshot={phase.snapshot} send={(a) => void act(a)} />
              ) : phase.snapshot.module === "letras" ? (
                <SongsRemote snapshot={phase.snapshot} send={(a) => void act(a)} />
              ) : (
                <CurrentPreview snapshot={phase.snapshot} pin={phase.pin} />
              )}
            </CardContent>
          </Card>

          <div className="grid shrink-0 grid-cols-2 gap-2">
            <Button size="lg" variant="outline" onClick={() => void act({ type: "prev" })}>
              <ChevronLeft className="mr-1 h-5 w-5" /> Anterior
            </Button>
            <Button size="lg" variant="outline" onClick={() => void act({ type: "next" })}>
              Próximo <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
            {phase.snapshot.live ? (
              <Button
                size="lg"
                variant="secondary"
                className="col-span-2"
                aria-pressed={true}
                onClick={() => void act({ type: "clear" })}
              >
                <Eraser className="mr-1 h-5 w-5" /> Limpar
              </Button>
            ) : (
              <Button
                size="lg"
                className="col-span-2"
                aria-pressed={false}
                onClick={() => void act({ type: "project" })}
              >
                <Play className="mr-1 h-5 w-5" /> Projetar
              </Button>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}

function currentTitle(snapshot: RemoteStateSnapshot): string {
  const item = snapshot.items[snapshot.selected_index];
  if (!item) return "Nada selecionado";
  return item.ref ? `${item.title} — ${item.ref}` : item.title;
}

function currentBody(snapshot: RemoteStateSnapshot): string {
  const item = snapshot.items[snapshot.selected_index];
  if (!item) return "Use o operador para montar a lista de projeção.";
  if (item.kind === "image" || item.kind === "video") return "(pré-visualização indisponível)";
  return item.body || "(sem conteúdo)";
}

/** Prévia do item selecionado: foto/vídeo vêm do `/media` do operador; texto mostra o corpo. */
function CurrentPreview({
  snapshot,
  pin,
}: {
  snapshot: RemoteStateSnapshot;
  pin: string;
}) {
  const item = snapshot.items[snapshot.selected_index];
  if (!item) {
    return <p className="text-sm text-muted-foreground">Use o operador para montar a lista de projeção.</p>;
  }
  if ((item.kind === "image" || item.kind === "video") && item.has_media) {
    const src = mediaUrl(resolveApiBase(), pin, item.id);
    if (item.kind === "image") {
      return (
        <img
          key={item.id}
          src={src}
          alt={item.title}
          className="max-h-64 min-h-40 w-full rounded-md border bg-black object-contain"
        />
      );
    }
    return (
      <video
        key={item.id}
        src={src}
        controls
        muted
        playsInline
        preload="metadata"
        className="max-h-64 min-h-40 w-full rounded-md border bg-black"
      />
    );
  }
  return (
    <ScrollArea className="min-h-0 flex-1 rounded-md border p-3">
      <p className="text-sm whitespace-pre-line">{currentBody(snapshot)}</p>
    </ScrollArea>
  );
}
