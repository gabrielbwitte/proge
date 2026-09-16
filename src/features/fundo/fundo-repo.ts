import { ensureSchema } from "@/db/client";
import { getSetting, setSetting } from "@/db/settings-repo";
import type { FundoWallpapers } from "@/features/projection/types";

const KEY = "fundo.wallpapers";

export async function getWallpapers(): Promise<FundoWallpapers> {
  try {
    await ensureSchema();
    const raw = await getSetting(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<FundoWallpapers>;
    const out: FundoWallpapers = {};
    for (const k of ["padrao", "biblia", "letra"] as const) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export async function setWallpaper(category: keyof FundoWallpapers, path: string | null): Promise<FundoWallpapers> {
  await ensureSchema();
  const current = await getWallpapers();
  const next: FundoWallpapers = { ...current };
  if (path) next[category] = path;
  else delete next[category];
  const saved = await setSetting(KEY, JSON.stringify(next));
  if (!saved) {
    throw new Error(
      "Banco de dados indisponível — rode via `npm run tauri dev` (no browser o plugin-sql não existe).",
    );
  }
  return next;
}
