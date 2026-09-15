import Database from "@tauri-apps/plugin-sql";
import { SCHEMA_STATEMENTS } from "./schema";

const DB_PATH = "sqlite:proge.db";

let dbPromise: Promise<Database | null> | null = null;

async function loadDatabase(): Promise<Database | null> {
  try {
    return await Database.load(DB_PATH);
  } catch {
    // Fora do Tauri (ex.: `npm run dev` no browser) o plugin não existe.
    return null;
  }
}

export function getDatabase(): Promise<Database | null> {
  if (!dbPromise) dbPromise = loadDatabase();
  return dbPromise;
}

let schemaPromise: Promise<boolean> | null = null;

/** Cria tabelas se necessário. Retorna false quando o SQLite não está disponível. */
export function ensureSchema(): Promise<boolean> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = await getDatabase();
      if (!db) return false;
      for (const sql of SCHEMA_STATEMENTS) {
        await db.execute(sql);
      }
      return true;
    })().catch(() => false);
  }
  return schemaPromise;
}
