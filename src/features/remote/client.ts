import type { RemoteAction, RemoteStateSnapshot } from "./types";

const PIN_STORAGE_KEY = "proge.remote_pin";

/** PIN válido: exatamente 4 dígitos. */
const PIN_RE = /^\d{4}$/;

/**
 * Base da API. Por padrão a mesma origem da página (o Axum serve página
 * + API juntos). `?api=http://...` permite apontar p/ outro host
 * (útil p/ testar no `npm run dev` do operador).
 */
export function resolveApiBase(): string {
  try {
    const override =
      queryParam("api") ?? new URLSearchParams(window.location.search).get("api")?.trim();
    if (override) return override.replace(/\/+$/, "");
  } catch {
    // cai para a origem abaixo
  }
  return window.location.origin;
}

/**
 * Lê um parâmetro da query. O QR entrega `?pin=` dentro do hash
 * (`/#/remote?pin=1234`), que não aparece em `location.search` —
 * por isso o hash é lido primeiro.
 */
function queryParam(name: string): string | null {
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf("?");
    if (qIndex >= 0) {
      const value = new URLSearchParams(hash.slice(qIndex + 1)).get(name)?.trim();
      if (value) return value;
    }
    return new URLSearchParams(window.location.search).get(name)?.trim() ?? null;
  } catch {
    return null;
  }
}

/** PIN do QR (`?pin=`) com persistência em `localStorage`.
 *
 * O PIN da URL é consumido uma única vez: vale só na primeira leitura e
 * é removido da URL em seguida. Sem isso, um `?pin=` velho no hash
 * sombrearia para sempre o PIN digitado manualmente (login ok com o
 * digitado, mas ações seguintes mandando o velho → 401).
 */
export function resolvePin(): string {
  try {
    const fromUrl = queryParam("pin") ?? "";
    if (fromUrl) {
      stripPinFromUrl();
      if (PIN_RE.test(fromUrl)) {
        window.localStorage.setItem(PIN_STORAGE_KEY, fromUrl);
        return fromUrl;
      }
      // PIN da URL inválido: ignora e cai para o armazenado.
    }
    const stored = window.localStorage.getItem(PIN_STORAGE_KEY) ?? "";
    return PIN_RE.test(stored) ? stored : "";
  } catch {
    return "";
  }
}

/** Remove o parâmetro `pin` do hash e da query sem recarregar a página. */
export function stripPinFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    const hash = url.hash;
    const qIndex = hash.indexOf("?");
    if (qIndex >= 0) {
      const params = new URLSearchParams(hash.slice(qIndex + 1));
      if (params.has("pin")) {
        params.delete("pin");
        const rest = params.toString();
        url.hash = rest ? `${hash.slice(0, qIndex)}?${rest}` : hash.slice(0, qIndex);
        changed = true;
      }
    }
    if (url.searchParams.has("pin")) {
      url.searchParams.delete("pin");
      changed = true;
    }
    if (changed) {
      window.history.replaceState(null, "", url.toString());
    }
  } catch {
    // URL ilegível: nada a limpar
  }
}

export function savePin(pin: string): void {
  try {
    window.localStorage.setItem(PIN_STORAGE_KEY, pin.trim());
  } catch {
    // armazenamento indisponível: segue sem persistir
  }
}

export function clearPin(): void {
  try {
    window.localStorage.removeItem(PIN_STORAGE_KEY);
  } catch {
    // sem armazenamento: nada a limpar
  }
  // O PIN da URL precisa sair junto — senão o `resolvePin()` o relê
  // e o erro "PIN inválido" volta em loop mesmo após "Trocar PIN".
  stripPinFromUrl();
}

/** Marcador de build injetado pelo Vite (`__PROGE_BUILD__`). */
export function buildMarker(): string {
  try {
    return typeof __PROGE_BUILD__ === "string" && __PROGE_BUILD__
      ? __PROGE_BUILD__
      : "unknown";
  } catch {
    return "unknown";
  }
}

/** true quando o `localStorage` está gravável (aba privada pode bloquear). */
export function storageSelfTest(): boolean {
  try {
    const probe = "proge.remote_pin_probe";
    window.localStorage.setItem(probe, "1");
    const ok = window.localStorage.getItem(probe) === "1";
    window.localStorage.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}

/** true quando há um PIN válido guardado (nunca expõe o valor). */
export function hasStoredPin(): boolean {
  try {
    return PIN_RE.test(window.localStorage.getItem(PIN_STORAGE_KEY) ?? "");
  } catch {
    return false;
  }
}

async function authed(
  path: string,
  pin: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${pin.trim()}`,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 401) {
    throw new Error("PIN inválido — confira o PIN exibido no operador.");
  }
  return res;
}

export async function fetchRemoteState(
  base: string,
  pin: string,
): Promise<RemoteStateSnapshot> {
  const res = await authed(`${base}/api/state`, pin);
  if (!res.ok) throw new Error(`Falha ao carregar (${res.status}).`);
  const data = (await res.json()) as { state: RemoteStateSnapshot };
  return data.state;
}

export async function sendRemoteAction(
  base: string,
  pin: string,
  action: RemoteAction,
): Promise<void> {
  const res = await authed(`${base}/api/action`, pin, {
    method: "POST",
    body: JSON.stringify(action),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Falha (${res.status}).`);
  }
}

/** URL de foto/vídeo servida pelo Axum (o `mediaUrl` do operador é `asset://`, inútil no celular). */
export function mediaUrl(base: string, pin: string, path: string): string {
  return `${base}/media?path=${encodeURIComponent(path)}&pin=${encodeURIComponent(pin)}`;
}

/** WS bidirecional: recebe `state` (broadcast p/ todos) e envia ações. */
export function connectRemoteWs(
  base: string,
  pin: string,
  onState: (state: RemoteStateSnapshot) => void,
  onDisconnect?: () => void,
): () => void {
  const wsBase = base.replace(/^http/, "ws");
  const ws = new WebSocket(
    `${wsBase}/ws?pin=${encodeURIComponent(pin)}`,
  );
  let closed = false;
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as {
        type: string;
        state?: RemoteStateSnapshot;
      };
      if (msg.type === "state" && msg.state) onState(msg.state);
    } catch {
      // mensagem inválida: ignora
    }
  };
  ws.onclose = () => {
    if (!closed) onDisconnect?.();
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      // já fechado
    }
  };
  return () => {
    closed = true;
    try {
      ws.close();
    } catch {
      // já fechado
    }
  };
}
