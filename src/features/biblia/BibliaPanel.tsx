import * as React from "react";
import { useProjection } from "../projection/store";
import { useBibleNav } from "./nav-store";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export function BibliaPanel() {
  const { items, selectedIndex, selectIndex } = useProjection();
  const {
    versions,
    version,
    books,
    book,
    chapter,
    bookChapters,
    loading,
    setVersion,
    setBook,
    setChapter,
    refresh,
  } = useBibleNav();
  const selectedRef = React.useRef<HTMLButtonElement | null>(null);

  // Ao entrar no módulo, republica o capítulo atual (os items podem ser
  // de outro módulo — a lista é global e sem dono).
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, items]);

  if (loading) {
    return (
      <div className="px-4 py-4 text-sm text-muted-foreground lg:px-6">
        Carregando Bíblia…
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 py-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma versão baixada</CardTitle>
            <CardDescription>
              Vá em Configuração → Bíblia e baixe uma versão (ex.: Almeida RA,
              RC, ACF) para usar offline.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const selectedBookName = books.find((b) => b.abbrev === book)?.name ?? "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Versão</Label>
          <Select value={version} onValueChange={(v) => setVersion(v ?? "")}>
            <SelectTrigger className="w-96">
              <SelectValue placeholder="Versão" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.version} value={v.version}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Livro</Label>
          <Select value={book} onValueChange={(v) => setBook(v ?? "")}>
            <SelectTrigger className="w-96">
              <SelectValue placeholder="Livro">
                {selectedBookName || undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {books.map((b) => (
                <SelectItem key={b.abbrev} value={b.abbrev}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Capítulo</Label>
          <Select
            value={String(chapter)}
            onValueChange={(v) => setChapter(Number(v ?? 1) || 1)}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Cap." />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: bookChapters }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  Cap. {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ScrollArea className="h-full min-h-0 w-full flex-1 rounded-md border">
        <div className="flex flex-col gap-1 p-2">
          {items.map((item, i) => (
            <Button
              key={item.id}
              ref={i === selectedIndex ? selectedRef : null}
              variant={i === selectedIndex ? "secondary" : "ghost"}
              className="h-auto items-start justify-start gap-3 whitespace-normal py-2 text-left"
              onClick={() => selectIndex(i)}
            >
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
                {item.id.split(":").pop() ?? i + 1}
              </span>
              <span className="text-sm leading-relaxed">{item.body}</span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
