// Fonte de verdade do schema local (tauri-plugin-sql, SQLite).
// Executado de forma idempotente via `ensureSchema()` em client.ts.
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS bible_versions (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'pt',
    downloaded_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS books (
    abbrev TEXT NOT NULL,
    version TEXT NOT NULL,
    name TEXT NOT NULL,
    chapters INTEGER NOT NULL,
    testament TEXT NOT NULL DEFAULT '',
    ord INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (abbrev, version)
  )`,
  `CREATE TABLE IF NOT EXISTS verses (
    version TEXT NOT NULL,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    number INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (version, book, chapter, number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_verses_chapter
    ON verses (version, book, chapter)`,
  `CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'local',
    external_id TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS song_sections (
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    ord INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    PRIMARY KEY (song_id, ord)
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS web_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'generic',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
];
