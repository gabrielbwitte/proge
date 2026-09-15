import { ensureSchema, getDatabase } from "@/db/client";
import type { ApiBook, ApiVerse } from "./api";

export interface BibleVersionRow {
  version: string;
  name: string;
  downloaded_at: string;
  verse_count: number;
}

export interface BookRow {
  abbrev: string;
  name: string;
  chapters: number;
  testament: string;
  ord: number;
}

export interface VerseRow {
  number: number;
  text: string;
}

/** Versões 100% baixadas (com contagem real de versículos). */
export async function listVersions(): Promise<BibleVersionRow[]> {
  try {
    await ensureSchema();
    const db = await getDatabase();
    if (!db) return [];
    return await db.select<BibleVersionRow[]>(
      `SELECT v.version, v.name, v.downloaded_at,
              (SELECT COUNT(*) FROM verses WHERE version = v.version) AS verse_count
       FROM bible_versions v ORDER BY v.version`,
    );
  } catch (e) {
    console.error("[Bíblia] listVersions falhou:", e);
    return [];
  }
}

/** Versículos presentes mesmo sem a versão marcada como baixada (download parcial). */
export async function countVerses(version: string): Promise<number> {
  try {
    await ensureSchema();
    const db = await getDatabase();
    if (!db) return 0;
    const rows = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM verses WHERE version = $1",
      [version],
    );
    return rows[0]?.n ?? 0;
  } catch (e) {
    console.error(`[Bíblia] countVerses(${version}) falhou:`, e);
    return 0;
  }
}

export async function saveBooks(
  version: string,
  books: ApiBook[],
): Promise<void> {
  await ensureSchema();
  const db = await getDatabase();
  if (!db) throw new Error("SQLite indisponível.");
  // abbrev = bookid canônico 1–66 (ordem by ord). Testamento pelo cânone
  // protestante (a Bolls não informa testament no get-books).
  const values = books
    .map(
      (_, i) =>
        `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`,
    )
    .join(", ");
  const params: (string | number)[] = [];
  books.forEach((b, i) => {
    params.push(
      String(b.bookid),
      version,
      b.name,
      b.chapters,
      b.bookid <= 39 ? "AT" : "NT",
      i,
    );
  });
  await db.execute(
    `INSERT INTO books (abbrev, version, name, chapters, testament, ord)
     VALUES ${values}
     ON CONFLICT(abbrev, version) DO UPDATE SET
       name = excluded.name, chapters = excluded.chapters,
       testament = excluded.testament, ord = excluded.ord`,
    params,
  );
}

export async function chapterExists(
  version: string,
  abbrev: string,
  chapter: number,
): Promise<boolean> {
  const db = await getDatabase();
  if (!db) return false;
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM verses WHERE version = $1 AND book = $2 AND chapter = $3",
    [version, abbrev, chapter],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Insere o capítulo em lote (1 statement para ~200 versículos). */
export async function saveChapter(
  version: string,
  abbrev: string,
  chapter: number,
  verses: ApiVerse[],
): Promise<void> {
  const db = await getDatabase();
  if (!db) throw new Error("SQLite indisponível.");
  const BATCH = 200;
  for (let i = 0; i < verses.length; i += BATCH) {
    const batch = verses.slice(i, i + BATCH);
    const values = batch
      .map(
        (_, j) =>
          `($${j * 5 + 1}, $${j * 5 + 2}, $${j * 5 + 3}, $${j * 5 + 4}, $${j * 5 + 5})`,
      )
      .join(", ");
    const params: (string | number)[] = [];
    for (const v of batch) {
      params.push(version, abbrev, chapter, v.number, v.text);
    }
    await db.execute(
      `INSERT INTO verses (version, book, chapter, number, text)
       VALUES ${values}
       ON CONFLICT(version, book, chapter, number) DO UPDATE SET text = excluded.text`,
      params,
    );
  }
}

export async function markVersionDownloaded(
  version: string,
  name: string,
): Promise<void> {
  const db = await getDatabase();
  if (!db) throw new Error("SQLite indisponível.");
  await db.execute(
    `INSERT INTO bible_versions (version, name, lang, downloaded_at)
     VALUES ($1, $2, 'pt', datetime('now'))
     ON CONFLICT(version) DO UPDATE SET name = excluded.name, downloaded_at = excluded.downloaded_at`,
    [version, name],
  );
}

export async function deleteVersion(version: string): Promise<void> {
  const db = await getDatabase();
  if (!db) throw new Error("SQLite indisponível.");
  await db.execute("DELETE FROM verses WHERE version = $1", [version]);
  await db.execute("DELETE FROM books WHERE version = $1", [version]);
  await db.execute("DELETE FROM bible_versions WHERE version = $1", [version]);
}

export async function listBooks(version: string): Promise<BookRow[]> {
  await ensureSchema();
  const db = await getDatabase();
  if (!db) return [];
  return db.select<BookRow[]>(
    "SELECT abbrev, name, chapters, testament, ord FROM books WHERE version = $1 ORDER BY ord",
    [version],
  );
}

export async function listChapter(
  version: string,
  abbrev: string,
  chapter: number,
): Promise<VerseRow[]> {
  const db = await getDatabase();
  if (!db) return [];
  return db.select<VerseRow[]>(
    "SELECT number, text FROM verses WHERE version = $1 AND book = $2 AND chapter = $3 ORDER BY number",
    [version, abbrev, chapter],
  );
}
