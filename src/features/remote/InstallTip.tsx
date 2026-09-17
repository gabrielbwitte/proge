import * as React from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DISMISSED_KEY = "proge.install_tip_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function isStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    return (window.navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function isIOS(): boolean {
  try {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  } catch {
    return false;
  }
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * Guia "criar app" na tela de PIN: em http de LAN o navegador não oferece
 * instalação automática, então orienta o fluxo manual (menu do navegador).
 * Some quando já instalado ou dispensado.
 */
export function InstallTip() {
  const [visible, setVisible] = React.useState(
    () => !isStandalone() && !wasDismissed(),
  );
  const [deferred, setDeferred] =
    React.useState<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // sem armazenamento: some só nesta sessão
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // usuário dispensou: mantém a dica
    }
    setDeferred(null);
  };

  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-4">
        <Download className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm font-medium">Usar como app no celular</p>
          {deferred ? (
            <Button size="sm" className="w-fit" onClick={() => void install()}>
              Instalar agora
            </Button>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {isIOS()
                ? "Toque em Compartilhar e depois em “Adicionar à Tela de Início”."
                : "Toque no menu ⋮ do navegador e depois em “Adicionar à tela inicial”."}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={dismiss}
          aria-label="Dispensar dica de instalação"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
