export type WebLinkKind = "youtube" | "generic";

export interface ParsedWebUrl {
  kind: WebLinkKind;
  /** URL original normalizada (o que o usuário colou). */
  sourceUrl: string;
  /** URL pronta para o <iframe> do telão (YouTube já com autoplay). */
  embedUrl: string;
  /** ID do vídeo (só YouTube). */
  videoId?: string;
  /** Miniatura (só YouTube). */
  thumbUrl?: string;
}

export function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Embed com autoplay desligado para previews (operador e celular).
 * O telão usa a URL com `autoplay=1`; genéricas passam intactas.
 */
export function previewEmbedUrl(embedUrl: string): string {
  return embedUrl.replace("autoplay=1", "autoplay=0");
}

function withScheme(raw: string): string {
  const trimmed = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** "1h2m3s" | "90" | "1m30s" -> segundos. null se inválido. */
function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  const total = h * 3600 + min * 60 + s;
  return total > 0 ? total : null;
}

function extractYouTubeId(url: URL, host: string): string | null {
  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ?? null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  // /watch?v=<id>
  if (parts[0] === "watch") return url.searchParams.get("v");
  // /shorts/<id> /live/<id> /embed/<id> /v/<id>
  if (
    (parts[0] === "shorts" ||
      parts[0] === "live" ||
      parts[0] === "embed" ||
      parts[0] === "v") &&
    parts[1]
  ) {
    return parts[1];
  }
  return null;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

function isYouTubeHost(host: string): boolean {
  return host === "youtu.be" || YOUTUBE_HOSTS.has(host);
}

/**
 * Normaliza um link colado pelo operador.
 * YouTube vira embed com autoplay; qualquer outra URL http(s) passa crua.
 * Lança Error com mensagem amigável quando inválida.
 */
export function parseWebUrl(raw: string): ParsedWebUrl {
  const input = raw.trim();
  if (!input) throw new Error("Cole um link.");
  let url: URL;
  try {
    url = new URL(withScheme(input));
  } catch {
    throw new Error("Link inválido. Cole uma URL completa (ex.: https://…).");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Use um link http(s).");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const fullHost = url.hostname.toLowerCase();

  if (isYouTubeHost(host) || isYouTubeHost(fullHost)) {
    const id = extractYouTubeId(url, host);
    if (!id || !/^[A-Za-z0-9_-]{6,}$/.test(id)) {
      throw new Error(
        "Link do YouTube não reconhecido. Use watch, youtu.be, shorts, live ou embed.",
      );
    }
    const start =
      parseTimestamp(url.searchParams.get("t")) ??
      parseTimestamp(url.searchParams.get("start"));
    const params = new URLSearchParams({ autoplay: "1", rel: "0" });
    if (start != null) params.set("start", String(start));
    const embedUrl = `https://www.youtube.com/embed/${id}?${params.toString()}`;
    return {
      kind: "youtube",
      sourceUrl: url.toString(),
      embedUrl,
      videoId: id,
      thumbUrl: youtubeThumb(id),
    };
  }

  const genericHost = url.hostname.toLowerCase();
  if (!genericHost.includes(".") && genericHost !== "localhost") {
    throw new Error("Link inválido. Cole uma URL completa (ex.: https://…).");
  }
  return { kind: "generic", sourceUrl: url.toString(), embedUrl: url.toString() };
}
