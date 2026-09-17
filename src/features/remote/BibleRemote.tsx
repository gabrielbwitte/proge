import * as React from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RemoteAction, RemoteStateSnapshot } from "./types";

const selectClass =
  "w-full rounded-md border border-input bg-background px-2 py-2 text-sm";

/** Navegação da Bíblia no celular: versão/livro/capítulo + lista de versículos. */
export function BibleRemote({
  snapshot,
  send,
}: {
  snapshot: RemoteStateSnapshot;
  send: (action: RemoteAction) => void;
}) {
  const bible = snapshot.bible;
  const selectedRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [snapshot.selected_index, snapshot.items]);

  if (!bible || bible.versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma versão baixada no operador. Vá em Configuração → Bíblia e baixe
        uma versão para usar no controle.
      </p>
    );
  }

  const bookChapters =
    bible.books.find((b) => b.abbrev === bible.book)?.chapters ?? 0;

  // A lista de items é global e sem dono: se ainda contém items de outro
  // módulo (ex.: fotos), espera o capítulo em vez de listar caminhos.
  const foreignItems =
    snapshot.items.length > 0 &&
    snapshot.items.some((item) => item.category !== "biblia");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="grid shrink-0 grid-cols-[1fr_1fr_5rem] gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          Versão
          <select
            className={selectClass}
            value={bible.version}
            onChange={(e) => send({ type: "bible", version: e.target.value })}
            aria-label="Versão"
          >
            {bible.versions.map((v) => (
              <option key={v.version} value={v.version}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          Livro
          <select
            className={selectClass}
            value={bible.book}
            onChange={(e) => send({ type: "bible", book: e.target.value })}
            aria-label="Livro"
          >
            {bible.books.map((b) => (
              <option key={b.abbrev} value={b.abbrev}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          Cap.
          <select
            className={selectClass}
            value={String(bible.chapter)}
            onChange={(e) =>
              send({ type: "bible", chapter: Number(e.target.value) || 1 })
            }
            aria-label="Capítulo"
          >
            {Array.from({ length: bookChapters }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-md border">
        <div className="flex flex-col gap-1 p-2">
          {snapshot.items.length === 0 || foreignItems ? (
            <p className="p-2 text-sm text-muted-foreground">
              Carregando capítulo…
            </p>
          ) : (
            snapshot.items.map((item, i) => (
              <Button
                key={item.id}
                ref={i === snapshot.selected_index ? selectedRef : null}
                variant={i === snapshot.selected_index ? "secondary" : "ghost"}
                className="h-auto items-start justify-start gap-2 whitespace-normal py-2 text-left"
                onClick={() => send({ type: "select", index: i })}
              >
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
                  {item.id.split(":").pop() ?? i + 1}
                </span>
                <span className="text-sm leading-relaxed">{item.body}</span>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
