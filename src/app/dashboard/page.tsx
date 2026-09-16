import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteFooter } from "@/components/site-footer"

import { SiteHeader } from "@/components/site-header"
import {
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar"
import {
    BibliaPanel,
    ConfigPanel,
    FotosPanel,
    FundoPanel,
    LetrasPanel,
    VideosPanel,
} from "@/features/modules/panels"
import { ProjectionProvider } from "@/features/projection/store"
import { useProjectionShortcuts } from "@/features/projection/useProjectionShortcuts"
import { autoApplySavedLayout } from "@/features/stage/monitors"
import type { ModuleId } from "@/features/projection/types"

const MODULE_TITLES: Record<ModuleId, string> = {
    biblia: "Bíblia",
    letras: "Letras",
    fotos: "Fotos",
    videos: "Vídeos",
    fundo: "Fundo",
    configuracao: "Configuração",
}

function ModuleContent({ module }: { module: ModuleId }) {
    switch (module) {
        case "biblia":
            return <BibliaPanel />
        case "letras":
            return <LetrasPanel />
        case "fotos":
            return <FotosPanel />
        case "videos":
            return <VideosPanel />
        case "fundo":
            return <FundoPanel />
        case "configuracao":
            return <ConfigPanel />
    }
}

function ShortcutsHost({ children }: { children: React.ReactNode }) {
  useProjectionShortcuts();
  return <>{children}</>;
}

export default function Page() {
    const [module, setModule] = React.useState<ModuleId>("biblia")
    // Boot (só operador): reabre uma janela fullscreen por saída salva.
    React.useEffect(() => {
        autoApplySavedLayout();
    }, [])
    return (
        <ProjectionProvider>
            <ShortcutsHost>
            <SidebarProvider
                style={
                    {
                        "--sidebar-width": "calc(var(--spacing) * 72)",
                        "--header-height": "calc(var(--spacing) * 12)",
                    } as React.CSSProperties
                }
            >
                <AppSidebar
                  variant="inset"
                  activeModule={module}
                  onModuleSelect={setModule}
                />
                <SidebarInset className="h-svh overflow-hidden md:h-[calc(100svh-1rem)]">
                    <SiteHeader title={MODULE_TITLES[module]} />
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="@container/main flex min-h-0 flex-1 flex-col gap-2">
                            <ModuleContent module={module} />
                        </div>
                    </div>
                    <SiteFooter />
                </SidebarInset>
            </SidebarProvider>
            </ShortcutsHost>
        </ProjectionProvider>
    )
}
