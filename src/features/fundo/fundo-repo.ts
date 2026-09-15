import { getSetting, setSetting } from "@/db/settings-repo";
import type { FundoWallpapers } from "@/features/projection/types";

const KEY = "fundo.wallpapers";

export async function getWallpapers(): Promise<FundoWallpapers> {
  try {
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
  const current = await getWallpapers();
  const next: FundoWallpapers = { ...current };
  if (path) next[category] = path;
  else delete next[category];
  await setSetting(KEY, JSON.stringify(next));
  return next;
}
