import { ensureSchema, getDatabase } from "@/db/client";
import type { WebLinkKind } from "./web-url";

export interface WebLink {
  id: number;
  title: string;
  url: string;
  kind: WebLinkKind;
}

export interface WebLinkInput {
  title: string;
  url: string;
  kind: WebLinkKind;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listWebLinks(): Promise<WebLink[]> {
  await ensureSchema();
  const db = await getDatabase();
  if (!db) return [];
  const rows = await db.select<
    { id: number; title: string; url: string; kind: string }[]
  >("SELECT id, title, url, kind FROM web_links ORDER BY id");
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    kind: r.kind === "youtube" ? "youtube" : "generic",
  }));
}

export async function createWebLink(input: WebLinkInput): Promise<number> {
  await ensureSchema();
  const db = await getDatabase();
  if (!db) throw new Error(sqliteUnavailable());
  const now = nowIso();
  const res = await db.execute(
    "INSERT INTO web_links (title, url, kind, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
    [input.title, input.url, input.kind, now, now],
  );
  if (res.lastInsertId == null) {
    throw new Error("Não foi possível salvar o link.");
  }
  return res.lastInsertId;
}

export async function updateWebLink(
  id: number,
  input: WebLinkInput,
): Promise<void> {
  const db = await getDatabase();
  if (!db) throw new Error(sqliteUnavailable());
  await db.execute(
    "UPDATE web_links SET title = $1, url = $2, kind = $3, updated_at = $4 WHERE id = $5",
    [input.title, input.url, input.kind, nowIso(), id],
  );
}

export async function deleteWebLink(id: number): Promise<void> {
  const db = await getDatabase();
  if (!db) throw new Error(sqliteUnavailable());
  await db.execute("DELETE FROM web_links WHERE id = $1", [id]);
}

function sqliteUnavailable(): string {
  return "SQLite indisponível — rode via `npm run tauri dev`.";
}
