// Cliente da Bolls.life (https://bolls.life/api/).
// Sem token, sem cadastro, sem limite publicado.
// O mantenedor pede para NÃO raspar capítulo a capítulo: a tradução
// completa vem em 1 requisição (JSON único) — é o que usamos no download.

const BASE_URL = "https://bolls.life";

export interface ApiTranslation {
  short_name: string;
  full_name: string;
}

interface LanguagesResponse {
  language: string;
  translations: ApiTranslation[];
}

export interface ApiBook {
  bookid: number;
  name: string;
  chapters: number;
}

export interface ApiVerse {
  number: number;
  text: string;
}

export interface FullVerse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export class BibleApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new BibleApiError(0, "Sem conexão com a internet.");
  }
  if (!res.ok) {
    throw new BibleApiError(res.status, `Erro da API (${res.status}).`);
  }
  return (await res.json()) as T;
}

/** Traduções em português (ex.: ARA, ARC09, ACF11, NAA). */
export async function fetchTranslations(): Promise<ApiTranslation[]> {
  const data = await request<LanguagesResponse[]>(
    "/static/bolls/app/views/languages.json",
  );
  const pt = data.find((l) => l.language === "Portuguese");
  return pt?.translations ?? [];
}

export function fetchBooks(slug: string): Promise<ApiBook[]> {
  return request<ApiBook[]>(`/get-books/${slug}/`);
}

/**
 * Tradução completa em 1 requisição (~31 mil versículos).
 * Aceita tanto o array puro quanto `{ verses: [...] }`.
 */
export async function fetchFullTranslation(slug: string): Promise<FullVerse[]> {
  const data = await request<FullVerse[] | { verses: FullVerse[] }>(
    `/static/translations/${slug}.json`,
  );
  const list = Array.isArray(data) ? data : data.verses;
  if (!Array.isArray(list) || list.length === 0) {
    throw new BibleApiError(
      -1,
      `Formato inesperado na tradução ${slug}. Tente outra versão.`,
    );
  }
  return list;
}

/** A API retorna o texto com tags HTML (`<i>`, `</br>`…) — limpar antes de salvar. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>\s*<p[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
