// Ambas sem token. LouvorJA = gospel BR (harpa/hinário). LRCLIB = global, fallback.
// Espelha src/features/biblia/api.ts (BibleApiError + request).

export class LyricsApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface RemoteHit {
  id: string;
  title: string;
  artist: string;
  source: "louvorja" | "lrclib";
  /** Usado para buscar a letra completa depois. */
  fetchKey: string;
}

const LOUVO_RJA_BASE = "https://api.louvorja.com.br";
const LRCLIB_BASE = "https://lrclib.net";

async function requestJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new LyricsApiError(0, "Sem conexão com a internet.");
  }
  if (res.status === 429) {
    throw new LyricsApiError(429, "Limite da API atingido. Tente novamente em instantes.");
  }
  if (!res.ok) {
    throw new LyricsApiError(res.status, `Erro da API (${res.status}).`);
  }
  return (await res.json()) as T;
}

// --- LouvorJA ---
// GET /pt/musics?search=termo  (público, sem JWT)
// A API retorna variações: array direto ou {data:[], musics:[]} ou paginação.
interface LouvorJAMusicRaw {
  id: number | string;
  title?: string;
  name?: string;
  artist?: string;
  artist_name?: string;
  band?: string;
  author?: string;
}

function pickLouvorJATitle(m: LouvorJAMusicRaw): string {
  return (m.title ?? m.name ?? "").trim();
}
function pickLouvorJAArtist(m: LouvorJAMusicRaw): string {
  return (m.artist ?? m.artist_name ?? m.band ?? m.author ?? "").trim();
}

function extractLouvorJAList(data: unknown): LouvorJAMusicRaw[] {
  if (Array.isArray(data)) return data as LouvorJAMusicRaw[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["data", "musics", "items", "results"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as LouvorJAMusicRaw[];
    }
    // paginação tipo { data: [...], total, ... } já tratada acima;
    // se objeto único com id, trata como lista de 1
    if ("id" in obj) return [obj as unknown as LouvorJAMusicRaw];
  }
  return [];
}

export async function searchLouvorJA(query: string): Promise<RemoteHit[]> {
  const q = encodeURIComponent(query.trim());
  const url = `${LOUVO_RJA_BASE}/pt/musics?search=${q}&limit=10`;
  try {
    const data = await requestJson<unknown>(url);
    const list = extractLouvorJAList(data);
    const hits: RemoteHit[] = [];
    for (const m of list) {
      const title = pickLouvorJATitle(m);
      if (!title) continue;
      const artist = pickLouvorJAArtist(m) || "—";
      hits.push({
        id: String(m.id),
        title,
        artist,
        source: "louvorja",
        fetchKey: String(m.id),
      });
    }
    return hits.slice(0, 10);
  } catch (e) {
    // LouvorJA está com falha 500 no endpoint musics no momento (SQL files.host).
    // Degrada graciosamente para que o LRCLIB ainda funcione.
    if (e instanceof LyricsApiError && (e.status === 404 || e.status === 500)) return [];
    return [];
  }
}

export async function fetchLouvorJA(id: string): Promise<{ title: string; artist: string; text: string }> {
  const url = `${LOUVO_RJA_BASE}/pt/musics/${encodeURIComponent(id)}`;
  const data = await requestJson<Record<string, unknown>>(url);
  // A letra pode estar em data.lyrics, data.text, data.content, ou aninhada.
  const root = (data && typeof data === "object" && "data" in data && typeof (data as Record<string, unknown>).data === "object"
    ? (data as Record<string, unknown>).data as Record<string, unknown>
    : data) as Record<string, unknown>;
  const title = String(root.title ?? root.name ?? "").trim() || "—";
  const artist = String(root.artist ?? root.artist_name ?? root.band ?? root.author ?? "").trim() || "—";
  const text =
    String(root.text ?? root.lyrics ?? root.content ?? root.body ?? (root as Record<string, unknown>).lyric ?? "").trim();
  // Se veio como objeto { lyrics: "..." } dentro de "lyrics"
  const normalizedText = text || (typeof root.lyrics === "object" && root.lyrics ? String((root.lyrics as Record<string, unknown>).text ?? "") : "");
  if (!normalizedText) throw new LyricsApiError(-1, "Letra não encontrada para essa música.");
  return { title, artist, text: stripHtml(normalizedText) };
}

// --- LRCLIB ---
interface LRCLIBRecord {
  id: number;
  trackName: string;
  artistName: string;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export async function searchLRCLIB(query: string): Promise<RemoteHit[]> {
  const q = encodeURIComponent(query.trim());
  const url = `${LRCLIB_BASE}/api/search?q=${q}`;
  const data = await requestJson<LRCLIBRecord[]>(url);
  return data.slice(0, 10).map((r) => ({
    id: String(r.id),
    title: r.trackName,
    artist: r.artistName,
    source: "lrclib" as const,
    fetchKey: String(r.id),
  }));
}

export async function fetchLRCLIB(id: string): Promise<{ title: string; artist: string; text: string }> {
  const url = `${LRCLIB_BASE}/api/get/${encodeURIComponent(id)}`;
  const data = await requestJson<LRCLIBRecord>(url);
  const text = (data.plainLyrics ?? data.syncedLyrics ?? "").trim();
  if (!text) throw new LyricsApiError(-1, "Letra não encontrada para essa música.");
  // syncedLyrics vem em LRC "[00:12.34] linha" — limpar timestamps
  const plain = text
    .split("\n")
    .map((line) => line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, "").trimEnd())
    .join("\n")
    .trim();
  return { title: data.trackName, artist: data.artistName, text: stripHtml(plain) };
}

// --- Unificado ---
export async function searchLyrics(query: string): Promise<RemoteHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const [a, b] = await Promise.allSettled([searchLouvorJA(trimmed), searchLRCLIB(trimmed)]);
  const louvor = a.status === "fulfilled" ? a.value : [];
  const lrclib = b.status === "fulfilled" ? b.value : [];
  if (a.status === "rejected" && b.status === "rejected") throw a.reason;
  // Dedupe por title+artist normalizado; LouvorJA vence.
  const seen = new Set<string>();
  const merged: RemoteHit[] = [];
  for (const hit of [...louvor, ...lrclib]) {
    const key = `${hit.title.toLowerCase().trim()}|${hit.artist.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }
  return merged.slice(0, 20);
}

export async function fetchLyric(hit: RemoteHit): Promise<{ title: string; artist: string; text: string }> {
  if (hit.source === "louvorja") return fetchLouvorJA(hit.fetchKey);
  return fetchLRCLIB(hit.fetchKey);
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\r/g, "")
    .trim();
}
