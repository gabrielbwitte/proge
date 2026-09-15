import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import { getSetting, setSetting } from "@/db/settings-repo";
import { isTauri } from "@/lib/tauri";

export const PHOTOS_DIR_KEY = "media.photos_dir";
export const VIDEOS_DIR_KEY = "media.videos_dir";
export const VIDEO_LOOP_KEY = "media.video_loop";
export const VIDEO_MUTED_KEY = "media.video_muted";

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
export const VIDEO_EXTS = ["mp4", "webm", "mkv", "mov", "avi", "m4v"];

export interface MediaFile {
  path: string;
  name: string;
  size?: number;
}

export interface VideoPrefs {
  loop: boolean;
  muted: boolean;
}

export type MediaKind = "photos" | "videos";

function dirKey(kind: MediaKind): string {
  return kind === "photos" ? PHOTOS_DIR_KEY : VIDEOS_DIR_KEY;
}

function exts(kind: MediaKind): string[] {
  return kind === "photos" ? IMAGE_EXTS : VIDEO_EXTS;
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[/\\]+$/, "")}/${name}`;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Varredura recursiva; pastas ilegíveis são puladas sem abortar. */
async function walk(dir: string, wanted: Set<string>, out: MediaFile[]) {
  let entries;
  try {
    entries = await readDir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = joinPath(dir, entry.name);
    if (entry.isDirectory) {
      await walk(full, wanted, out);
    } else if (entry.isFile && wanted.has(extOf(entry.name))) {
      out.push({ path: full, name: entry.name });
    }
  }
}

export async function getMediaDir(kind: MediaKind): Promise<string> {
  return (await getSetting(dirKey(kind))) ?? "";
}

export async function setMediaDir(
  kind: MediaKind,
  dir: string,
): Promise<boolean> {
  return setSetting(dirKey(kind), dir);
}

export async function listMedia(
  kind: MediaKind,
): Promise<{ dir: string; files: MediaFile[] }> {
  const dir = await getMediaDir(kind);
  if (!dir) return { dir: "", files: [] };
  if (!isTauri()) throw new Error("Pastas locais exigem `npm run tauri dev`.");
  const files: MediaFile[] = [];
  await walk(dir, new Set(exts(kind)), files);
  files.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { dir, files };
}

/** Tamanho em bytes (melhor esforço; undefined se falhar). */
export async function fileSize(path: string): Promise<number | undefined> {
  try {
    const info = await stat(path);
    return info.size;
  } catch {
    return undefined;
  }
}

export function formatSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Caminho do disco -> URL carregável nas webviews (stage e miniaturas). */
export function resolveAssetUrl(path: string): string {
  return isTauri() ? convertFileSrc(path) : path;
}

/** Seletor de pasta (também libera o escopo de acesso no Tauri). */
export async function pickDirectory(
  current?: string,
): Promise<string | null> {
  if (!isTauri()) throw new Error("Seletor de pasta exige `npm run tauri dev`.");
  const selected = await open({
    directory: true,
    recursive: true,
    multiple: false,
    defaultPath: current || undefined,
    title: "Escolher pasta de mídia",
  });
  if (selected == null) return null;
  return Array.isArray(selected) ? (selected[0] ?? null) : selected;
}

export async function getVideoPrefs(): Promise<VideoPrefs> {
  const [loop, muted] = await Promise.all([
    getSetting(VIDEO_LOOP_KEY),
    getSetting(VIDEO_MUTED_KEY),
  ]);
  return { loop: loop !== "0", muted: muted === "1" };
}

export async function setVideoPrefs(prefs: VideoPrefs): Promise<void> {
  await Promise.all([
    setSetting(VIDEO_LOOP_KEY, prefs.loop ? "1" : "0"),
    setSetting(VIDEO_MUTED_KEY, prefs.muted ? "1" : "0"),
  ]);
}
