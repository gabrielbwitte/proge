import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RemoteAction, RemoteStateSnapshot } from "./types";

/** Busca de músicas + trechos no celular (espelha a biblioteca do operador). */
export function SongsRemote({
  snapshot,
  send,
}: {
  snapshot: RemoteStateSnapshot;
  send: (action: RemoteAction) => void;
}) {
  const nav = snapshot.letras;
  const [input, setInput] = React.useState(nav?.query ?? "");
  const lastSent = React.useRef(nav?.query ?? "");
  const selectedRef = React.useRef<HTMLButtonElement | null>(null);

  // Posição do operador (ex.: ele digitou) reflete aqui, sem brigar
  // com o que este celular já enviou.
  React.useEffect(() => {
    const q = nav?.query ?? "";
    if (q !== lastSent.current) {
      lastSent.current = q;
      setInput(q);
    }
  }, [nav?.query]);

  // Busca com debounce: 1 ação por pausa na digitação.
  React.useEffect(() => {
    if (input === lastSent.current) return;
    const timer = window.setTimeout(() => {
      lastSent.current = input;
      send({ type: "search", search_query: input });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [input, send]);

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [snapshot.selected_index, snapshot.items]);

  const results = nav?.results ?? [];

  // A lista de items é global e sem dono: se ainda contém items de outro
  // módulo, espera os trechos em vez de listar conteúdo alheio.
  const foreignItems =
    snapshot.items.length > 0 &&
    snapshot.items.some((item) => item.category !== "letra");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Buscar título ou artista…"
        aria-label="Buscar música"
        className="shrink-0"
      />

      {results.length > 0 ? (
        <ScrollArea className="max-h-40 min-h-0 shrink-0 rounded-md border">
          <div className="flex flex-col gap-1 p-2">
            {results.map((s) => (
              <Button
                key={s.id}
                variant={s.id === nav?.selectedId ? "secondary" : "ghost"}
                className="h-auto flex-col items-start whitespace-normal py-1.5 text-left"
                onClick={() => send({ type: "song", song_id: s.id })}
              >
                <span className="text-sm font-semibold">{s.title}</span>
                {s.artist ? (
                  <span className="text-xs text-muted-foreground">
                    {s.artist}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="shrink-0 text-sm text-muted-foreground">
          {!input.trim()
            ? "Digite para buscar na biblioteca do operador."
            : "Nenhum resultado — tente outro termo."}
        </p>
      )}

      <ScrollArea className="min-h-0 flex-1 rounded-md border">
        <div className="flex flex-col gap-1 p-2">
          {snapshot.items.length === 0 || foreignItems ? (
            <p className="p-2 text-sm text-muted-foreground">
              Selecione uma música para ver os trechos.
            </p>
          ) : (
            snapshot.items.map((item, i) => (
              <Button
                key={item.id}
                ref={i === snapshot.selected_index ? selectedRef : null}
                variant={i === snapshot.selected_index ? "secondary" : "ghost"}
                className="h-auto flex-col items-start whitespace-normal py-2 text-left"
                onClick={() => send({ type: "select", index: i })}
              >
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {item.title.split("—")[1]?.trim() ?? `Trecho ${i + 1}`}
                </span>
                <span className="text-sm leading-relaxed whitespace-pre-line">
                  {item.body}
                </span>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
