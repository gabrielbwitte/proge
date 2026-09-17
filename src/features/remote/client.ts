import type { RemoteAction, RemoteStateSnapshot } from "./types";

const PIN_STORAGE_KEY = "proge.remote_pin";

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

/** PIN do QR (`?pin=`) com persistência em `localStorage`. */
export function resolvePin(): string {
  try {
    const fromUrl = queryParam("pin") ?? "";
    if (fromUrl) {
      window.localStorage.setItem(PIN_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return window.localStorage.getItem(PIN_STORAGE_KEY) ?? "";
  } catch {
    return "";
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
      Authorization: `Bearer ${pin}`,
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
