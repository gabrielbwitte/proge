import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProjection } from "@/features/projection/store";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function SiteFooter() {
    // Regra: Anterior/Próximo trocam a seleção e, se NO AR, atualizam o telão
    // com o novo item. Com tela limpa, só movem a seleção (não reacendem).
    // Só Projetar/Limpar alteram a saída a partir de tela limpa.
    const {
        canPrev,
        canNext,
        canProject,
        live,
        stepPrev,
        stepNext,
        projectSelected,
        clear,
    } = useProjection();

    const [pulse, setPulse] = React.useState<"prev" | "next" | "project" | "clear" | null>(null);

    React.useEffect(() => {
        const onShortcut = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail as typeof pulse;
            if (detail !== "prev" && detail !== "next" && detail !== "project" && detail !== "clear") return;
            setPulse(detail);
            window.setTimeout(() => setPulse((cur) => (cur === detail ? null : cur)), 220);
        };
        window.addEventListener("proge:shortcut", onShortcut as EventListener);
        return () => window.removeEventListener("proge:shortcut", onShortcut as EventListener);
    }, []);
    return (
        <footer className="sticky bottom-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-t bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
            <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
                <div className="flex w-full items-center justify-start gap-2">
                    <Button disabled={!canPrev} onClick={() => void stepPrev()} aria-keyshortcuts="ArrowLeft PageUp" className={pulse === "prev" ? "proge-press ring-2 ring-ring" : undefined}>
                        <ChevronLeft />
                        <span>Anterior</span>
                        <kbd className="ml-1 hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">←</kbd>
                    </Button>
                    <Button disabled={!canNext} onClick={() => void stepNext()} aria-keyshortcuts="ArrowRight PageDown Space" className={pulse === "next" ? "proge-press ring-2 ring-ring" : undefined}>
                        <span>Próximo</span>
                        <ChevronRight />
                        <kbd className="ml-1 hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">→</kbd>
                    </Button>
                </div>
                <div className="flex w-full items-center justify-end gap-2">
                    {live ? (
                        <Badge variant="destructive">● NO AR</Badge>
                    ) : (
                        <Badge variant="outline">○ tela limpa</Badge>
                    )}
                    <Button
                        className={pulse === "project" ? "proge-press bg-green-700 hover:bg-green-800 ring-2 ring-ring" : "bg-green-700 hover:bg-green-800"}
                        disabled={!canProject}
                        onClick={() => projectSelected()}
                        aria-keyshortcuts="Enter"
                    >
                        <span>Projetar</span>
                        <kbd className="ml-1 hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">↵</kbd>
                    </Button>
                    <Button variant='secondary' onClick={() => clear()} aria-keyshortcuts="Escape" className={pulse === "clear" ? "proge-press ring-2 ring-ring" : undefined}>
                        <span>Limpar</span>
                        <kbd className="ml-1 hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">Esc</kbd>
                    </Button>
                </div>
            </div>
        </footer>
    )
}