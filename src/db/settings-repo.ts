import { getDatabase } from "./client";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  if (!db) return null;
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<boolean> {
  const db = await getDatabase();
  if (!db) return false;
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
  return true;
}
