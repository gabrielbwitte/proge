import { fetchBooks, fetchFullTranslation, stripHtml } from "./api";
import type { ApiVerse, FullVerse } from "./api";
import {
  chapterExists,
  markVersionDownloaded,
  saveBooks,
  saveChapter,
} from "./bible-repo";

export type DownloadPhase = "books" | "fetch" | "save" | "finish";

export interface DownloadProgress {
  phase: DownloadPhase;
  doneChapters: number;
  totalChapters: number;
  currentBook: string;
}

export type DownloadResult = { status: "done" } | { status: "cancelled" };

/**
 * Baixa a versão inteira em poucas requisições: catálogo de livros +
 * JSON único com todos os versículos (como pede o mantenedor da Bolls).
 * Agrupa por capítulo para manter progresso, cancelar e retomar
 * (capítulos já salvos são pulados).
 * A versão só aparece no seletor da Bíblia ao concluir 100%.
 */
export async function downloadVersion(
  slug: string,
  displayName: string,
  onProgress: (p: DownloadProgress) => void,
  shouldCancel: () => boolean,
): Promise<DownloadResult> {
  onProgress({ phase: "books", doneChapters: 0, totalChapters: 0, currentBook: "" });
  const books = await fetchBooks(slug);
  await saveBooks(slug, books);
  const totalChapters = books.reduce((sum, b) => sum + b.chapters, 0);

  onProgress({ phase: "fetch", doneChapters: 0, totalChapters, currentBook: "" });
  const full = await fetchFullTranslation(slug);
  const byChapter = new Map<string, ApiVerse[]>();
  for (const v of full) {
    if (!isFullVerse(v)) continue;
    const key = `${v.book}:${v.chapter}`;
    const list = byChapter.get(key) ?? [];
    list.push({ number: v.verse, text: stripHtml(v.text) });
    byChapter.set(key, list);
  }

  let doneChapters = 0;
  for (const book of books) {
    const abbrev = String(book.bookid);
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      if (shouldCancel()) return { status: "cancelled" };
      if (!(await chapterExists(slug, abbrev, chapter))) {
        const verses = (byChapter.get(`${book.bookid}:${chapter}`) ?? []).sort(
          (a, b) => a.number - b.number,
        );
        if (verses.length > 0) await saveChapter(slug, abbrev, chapter, verses);
      }
      doneChapters++;
      onProgress({ phase: "save", doneChapters, totalChapters, currentBook: book.name });
    }
  }

  await markVersionDownloaded(slug, displayName);
  onProgress({ phase: "finish", doneChapters, totalChapters, currentBook: "" });
  return { status: "done" };
}

function isFullVerse(v: FullVerse): boolean {
  return (
    typeof v.book === "number" &&
    typeof v.chapter === "number" &&
    typeof v.verse === "number" &&
    typeof v.text === "string"
  );
}
