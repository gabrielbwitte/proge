import { fetchLyric as fetchRemoteLyric, searchLyrics as searchRemoteLyrics, type RemoteHit } from "./api";
import { getSong, listSongs } from "./songs-repo";

export interface LyricSection {
  label: string;
  body: string;
}

export interface LyricSong {
  title: string;
  artist: string;
  sections: LyricSection[];
}

export interface LyricsSearchResult {
  id: string;
  title: string;
  artist: string;
}

/**
 * Contrato da fonte de letras: pesquisa + download.
 * Hoje: biblioteca local. Amanhã: trocar `activeProvider` pela API gospel
 * sem mexer no painel (mesma interface).
 */
export interface LyricsProvider {
  id: string;
  label: string;
  search(query: string): Promise<LyricsSearchResult[]>;
  fetchSong(id: string): Promise<LyricSong>;
}

export const localLyricsProvider: LyricsProvider = {
  id: "local",
  label: "Biblioteca local",
  async search(query: string) {
    const rows = await listSongs(query);
    return rows.map((r) => ({
      id: String(r.id),
      title: r.title,
      artist: r.artist,
    }));
  },
  async fetchSong(id: string) {
    const song = await getSong(Number(id));
    if (!song) throw new Error("Música não encontrada.");
    return {
      title: song.title,
      artist: song.artist,
      sections: song.sections,
    };
  },
};

/** Fonte remota sem token: LouvorJA (gospel BR) + LRCLIB (fallback global). */
export const remoteLyricsProvider: LyricsProvider = {
  id: "remote",
  label: "LouvorJA + LRCLIB",
  async search(query: string) {
    const hits = await searchRemoteLyrics(query);
    return hits.map((h: RemoteHit) => ({
      id: `${h.source}:${h.fetchKey}`,
      title: h.title,
      artist: h.artist,
    }));
  },
  async fetchSong(id: string) {
    const sep = id.indexOf(":");
    if (sep < 0) throw new Error("ID remoto inválido.");
    const source = id.slice(0, sep) as RemoteHit["source"];
    const fetchKey = id.slice(sep + 1);
    const hit: RemoteHit = { id, title: "", artist: "", source, fetchKey };
    const { title, artist, text } = await fetchRemoteLyric(hit);
    const sections = parseLyricsText(text);
    if (sections.length === 0) throw new Error("Letra vazia.");
    return { title, artist, sections };
  },
};

/**
 * Texto <-> trechos. Trechos separados por linha em branco;
 * primeira linha `[Rótulo]` vira o nome do trecho.
 */
export function parseLyricsText(raw: string): LyricSection[] {
  return raw
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk, i) => {
      const lines = chunk.split("\n").map((l) => l.trim());
      const match = lines[0].match(/^\[(.+)\]$/);
      if (match) {
        const body = lines.slice(1).join("\n").trim();
        return {
          label: match[1].trim() || `Trecho ${i + 1}`,
          body: body || chunk,
        };
      }
      return { label: `Trecho ${i + 1}`, body: chunk };
    })
    .filter((s) => s.body.length > 0);
}

export function serializeSections(sections: LyricSection[]): string {
  return sections.map((s) => `[${s.label}]\n${s.body}`).join("\n\n");
}
