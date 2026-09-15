import * as React from "react";
import { getSetting, setSetting } from "@/db/settings-repo";
import { useProjection } from "../projection/store";
import type { ProjectableItem } from "../projection/types";
import { listBooks, listChapter, listVersions } from "./bible-repo";
import type { BookRow, BibleVersionRow } from "./bible-repo";
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

const LAST_VERSION_KEY = "bible.last_version";
const LAST_BOOK_KEY = "bible.last_book";
const LAST_CHAPTER_KEY = "bible.last_chapter";

export function BibliaPanel() {
  const { items, selectedIndex, setItems, selectIndex } = useProjection();
  const [versions, setVersions] = React.useState<BibleVersionRow[]>([]);
  const [version, setVersion] = React.useState("");
  const [books, setBooks] = React.useState<BookRow[]>([]);
  const [book, setBook] = React.useState("");
  const [chapter, setChapter] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const selectedRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, items]);

  // Carrega versões baixadas + restaura última posição.
  React.useEffect(() => {
    (async () => {
      const [rows, lastVersion, lastBook, lastChapter] = await Promise.all([
        listVersions(),
        getSetting(LAST_VERSION_KEY),
        getSetting(LAST_BOOK_KEY),
        getSetting(LAST_CHAPTER_KEY),
      ]);
      setVersions(rows);
      const v = rows.some((r) => r.version === lastVersion)
        ? (lastVersion as string)
        : (rows[0]?.version ?? "");
      setVersion(v);
      if (lastBook) setBook(lastBook);
      if (lastChapter) setChapter(Number(lastChapter) || 1);
      setLoading(false);
    })();
  }, []);

  // Troca de versão -> carrega livros.
  React.useEffect(() => {
    if (!version) {
      setBooks([]);
      return;
    }
    setSetting(LAST_VERSION_KEY, version);
    (async () => {
      const rows = await listBooks(version);
      setBooks(rows);
      setBook((prev) =>
        rows.some((b) => b.abbrev === prev) ? prev : (rows[0]?.abbrev ?? ""),
      );
    })();
  }, [version]);

  // Troca de livro/capítulo -> carrega versículos e publica no store.
  // Clicar num versículo só seleciona; projetar é só via "Projetar".
  React.useEffect(() => {
    if (!version || !book) {
      setItems([]);
      return;
    }
    const maxChapter =
      books.find((b) => b.abbrev === book)?.chapters ?? 0;
    if (maxChapter > 0 && chapter > maxChapter) {
      setChapter(maxChapter);
      return;
    }
    setSetting(LAST_BOOK_KEY, book);
    setSetting(LAST_CHAPTER_KEY, String(chapter));
    const bookName = books.find((b) => b.abbrev === book)?.name ?? book;
    let cancelled = false;
    (async () => {
      const rows = await listChapter(version, book, chapter);
      if (cancelled) return;
      const label = (n: number) => `${bookName} ${chapter}:${n}`;
      const next: ProjectableItem[] = rows.map((v) => ({
        id: `${version}:${book}:${chapter}:${v.number}`,
        kind: "text",
        title: `${label(v.number)} (${version.toUpperCase()})`,
        body: v.text,
        ref: `${label(v.number)} • ${version.toUpperCase()}`,
        category: "biblia",
      }));
      setItems(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [version, book, chapter]);

  const bookChapters = books.find((b) => b.abbrev === book)?.chapters ?? 0;

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
          <Select value={book} onValueChange={(v) => { setBook(v ?? ""); setChapter(1); }}>
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
