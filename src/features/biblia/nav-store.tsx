import * as React from "react";
import { getSetting, setSetting } from "@/db/settings-repo";
import { useProjection } from "../projection/store";
import type { ProjectableItem } from "../projection/types";
import { listBooks, listChapter, listVersions } from "./bible-repo";
import type { BookRow, BibleVersionRow } from "./bible-repo";

const LAST_VERSION_KEY = "bible.last_version";
const LAST_BOOK_KEY = "bible.last_book";
const LAST_CHAPTER_KEY = "bible.last_chapter";

export interface BibleNav {
  versions: BibleVersionRow[];
  version: string;
  books: BookRow[];
  book: string;
  chapter: number;
  bookChapters: number;
  loading: boolean;
  setVersion: (v: string) => void;
  /** Troca o livro e volta ao capítulo 1 (igual ao painel). */
  setBook: (b: string) => void;
  setChapter: (n: number) => void;
  /** Republica o capítulo atual (chamado ao entrar no módulo). */
  refresh: () => void;
}

const BibleNavCtx = React.createContext<BibleNav | null>(null);

export function useBibleNav(): BibleNav {
  const nav = React.useContext(BibleNavCtx);
  if (!nav) throw new Error("useBibleNav exige <BibleNavProvider>.");
  return nav;
}

/**
 * Navegação da Bíblia compartilhada entre o painel do operador e o
 * controle remoto: trocar versão/livro/capítulo em qualquer ponta reflete
 * na outra (o capítulo carregado vira os items do projection store).
 */
export function BibleNavProvider({ children }: { children: React.ReactNode }) {
  const { setItems } = useProjection();
  const [versions, setVersions] = React.useState<BibleVersionRow[]>([]);
  const [version, setVersion] = React.useState("");
  const [books, setBooks] = React.useState<BookRow[]>([]);
  const [book, setBook] = React.useState("");
  const [chapter, setChapter] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

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
  // Usa ref p/ `refresh()` ter identidade estável (não reseta a seleção).
  const navRef = React.useRef({ version, book, chapter, books });
  navRef.current = { version, book, chapter, books };
  const genRef = React.useRef(0);
  const loadChapter = React.useCallback(async () => {
    const gen = ++genRef.current;
    const v = navRef.current.version;
    const b = navRef.current.book;
    const c = navRef.current.chapter;
    const bs = navRef.current.books;
    if (!v || !b) {
      setItems([]);
      return;
    }
    const maxChapter = bs.find((x) => x.abbrev === b)?.chapters ?? 0;
    if (maxChapter > 0 && c > maxChapter) {
      setChapter(maxChapter);
      return;
    }
    setSetting(LAST_BOOK_KEY, b);
    setSetting(LAST_CHAPTER_KEY, String(c));
    const bookName = bs.find((x) => x.abbrev === b)?.name ?? b;
    const rows = await listChapter(v, b, c);
    if (gen !== genRef.current) return;
    const label = (n: number) => `${bookName} ${c}:${n}`;
    const next: ProjectableItem[] = rows.map((verse) => ({
      id: `${v}:${b}:${c}:${verse.number}`,
      kind: "text",
      title: `${label(verse.number)} (${v.toUpperCase()})`,
      body: verse.text,
      category: "biblia",
    }));
    setItems(next);
  }, [setItems]);

  React.useEffect(() => {
    void loadChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, book, chapter, books]);

  const refresh = React.useCallback(() => {
    void loadChapter();
  }, [loadChapter]);

  const setBookAndReset = React.useCallback((b: string) => {
    setBook(b);
    setChapter(1);
  }, []);

  const setChapterClamped = React.useCallback((n: number) => {
    setChapter(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
  }, []);

  const bookChapters = books.find((b) => b.abbrev === book)?.chapters ?? 0;

  const value = React.useMemo<BibleNav>(
    () => ({
      versions,
      version,
      books,
      book,
      chapter,
      bookChapters,
      loading,
      setVersion,
      setBook: setBookAndReset,
      setChapter: setChapterClamped,
      refresh,
    }),
    [versions, version, books, book, chapter, bookChapters, loading, setBookAndReset, setChapterClamped, refresh],
  );

  return <BibleNavCtx.Provider value={value}>{children}</BibleNavCtx.Provider>;
}
