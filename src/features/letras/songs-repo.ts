import { ensureSchema, getDatabase } from "@/db/client";

export interface SongRow {
  id: number;
  title: string;
  artist: string;
  sections: number;
}

export interface SongSection {
  ord: number;
  label: string;
  body: string;
}

export interface SongDetail {
  id: number;
  title: string;
  artist: string;
  sections: SongSection[];
}

export interface SongInput {
  title: string;
  artist: string;
  sections: { label: string; body: string }[];
  /** Origem para distinguir local vs remoto; default 'local'. */
  source?: string;
  /** ID externo (LouvorJA id ou LRCLIB id). */
  externalId?: string;
}

export async function findRemoteSong(source: string, externalId: string): Promise<number | null> {
  await ensureSchema();
  const db = await getDatabase();
  if (!db) return null;
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM songs WHERE source = $1 AND external_id = $2 LIMIT 1",
    [source, externalId],
  );
  return rows.length > 0 ? rows[0].id : null;
}

export async function listDownloadedRemoteIds(): Promise<Set<string>> {
  await ensureSchema();
  const db = await getDatabase();
  if (!db) return new Set();
  const rows = await db.select<{ source: string; external_id: string }[]>(
    "SELECT source, external_id FROM songs WHERE source IN ('louvorja','lrclib') AND external_id != ''",
  );
  return new Set(rows.map((r) => `${r.source}:${r.external_id}`));
}

const LIST_SQL = `SELECT s.id, s.title, s.artist,
    (SELECT COUNT(*) FROM song_sections WHERE song_id = s.id) AS sections
  FROM songs s`;

export async function listSongs(query = ""): Promise<SongRow[]> {
  await ensureSchema();
  const db = await getDatabase();
  if (!db) return [];
  const q = query.trim();
  if (q) {
    const like = `%${q}%`;
    return db.select<SongRow[]>(
      `${LIST_SQL} WHERE s.title LIKE $1 OR s.artist LIKE $2 ORDER BY s.title`,
      [like, like],
    );
  }
  return db.select<SongRow[]>(`${LIST_SQL} ORDER BY s.title`);
}

export async function getSong(id: number): Promise<SongDetail | null> {
  const db = await getDatabase();
  if (!db) return null;
  const rows = await db.select<{ title: string; artist: string }[]>(
    "SELECT title, artist FROM songs WHERE id = $1",
    [id],
  );
  if (rows.length === 0) return null;
  const sections = await db.select<SongSection[]>(
    "SELECT ord, label, body FROM song_sections WHERE song_id = $1 ORDER BY ord",
    [id],
  );
  return { id, title: rows[0].title, artist: rows[0].artist, sections };
}

async function saveSections(
  songId: number,
  sections: { label: string; body: string }[],
): Promise<void> {
  const db = await getDatabase();
  if (!db) throw new Error(sqliteUnavailable());
  await db.execute("DELETE FROM song_sections WHERE song_id = $1", [songId]);
  for (let i = 0; i < sections.length; i++) {
    await db.execute(
      "INSERT INTO song_sections (song_id, ord, label, body) VALUES ($1, $2, $3, $4)",
      [songId, i, sections[i].label, sections[i].body],
    );
  }
}

export async function createSong(input: SongInput): Promise<number> {
  await ensureSchema();
  const db = await getDatabase();
  if (!db) throw new Error(sqliteUnavailable());
  const source = input.source ?? "local";
  const externalId = input.externalId ?? "";
  const res = await db.execute(
    "INSERT INTO songs (title, artist, source, external_id, search_text) VALUES ($1, $2, $3, $4, $5)",
    [input.title, input.artist, source, externalId, `${input.title} ${input.artist}`.toLowerCase()],
  );
  if (res.lastInsertId == null) {
    throw new Error("Não foi possível salvar a música.");
  }
  await saveSections(res.lastInsertId, input.sections);
  return res.lastInsertId;
}

export async function updateSong(id: number, input: SongInput): Promise<void> {
  const db = await getDatabase();
  if (!db) throw new Error(sqliteUnavailable());
  await db.execute(
    "UPDATE songs SET title = $1, artist = $2, search_text = $3 WHERE id = $4",
    [input.title, input.artist, `${input.title} ${input.artist}`.toLowerCase(), id],
  );
  await saveSections(id, input.sections);
}

export async function deleteSong(id: number): Promise<void> {
  const db = await getDatabase();
  if (!db) throw new Error(sqliteUnavailable());
  await db.execute("DELETE FROM song_sections WHERE song_id = $1", [id]);
  await db.execute("DELETE FROM songs WHERE id = $1", [id]);
}

function sqliteUnavailable(): string {
  return "SQLite indisponível — rode via `npm run tauri dev`.";
}
