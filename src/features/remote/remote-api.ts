import { invoke } from "@tauri-apps/api/core";
import { ensureSchema } from "@/db/client";
import { getSetting, setSetting } from "@/db/settings-repo";
import { isTauri } from "@/lib/tauri";
import {
  REMOTE_PIN_KEY,
  REMOTE_PORT_KEY,
  type RemoteStatus,
  type RemoteSyncPayload,
} from "./types";

function ensureTauri(): void {
  if (!isTauri()) throw new Error("Controle remoto exige `npm run tauri dev`.");
}

export async function remoteGetStatus(): Promise<RemoteStatus> {
  ensureTauri();
  return invoke<RemoteStatus>("remote_get_status");
}

export async function remoteStart(port?: number, pin?: string): Promise<RemoteStatus> {
  ensureTauri();
  return invoke<RemoteStatus>("remote_start", {
    port: port ?? null,
    pin: pin ?? null,
  });
}

export async function remoteStop(): Promise<RemoteStatus> {
  ensureTauri();
  return invoke<RemoteStatus>("remote_stop");
}

export async function remoteSetPort(port: number): Promise<RemoteStatus> {
  ensureTauri();
  return invoke<RemoteStatus>("remote_set_port", { port });
}

export async function remoteRegenPin(): Promise<RemoteStatus> {
  ensureTauri();
  const status = await invoke<RemoteStatus>("remote_regen_pin");
  // Persiste para o PIN sobreviver ao reinício do operador.
  await setSetting(REMOTE_PIN_KEY, status.pin).catch(() => false);
  return status;
}

/** Espelho do operador → broadcast para os celulares. Silencioso fora do Tauri. */
export async function remoteSync(payload: RemoteSyncPayload): Promise<void> {
  if (!isTauri()) return;
  await invoke("remote_sync", { payload });
}

let ensureInflight: Promise<RemoteStatus & { persisted: boolean }> | null = null;

/**
 * Sobe o servidor reaproveitando porta/PIN salvos em `app_settings`
 * (o PIN passa a sobreviver ao reinício do operador). Idempotente e
 * seguro para chamadas concorrentes (ponte de sync + card de Sistema).
 * `persisted=false` indica que a gravação no SQLite falhou — nesse caso
 * o PIN volta a ser sorteado a cada reinício (o card de Sistema avisa).
 */
export async function ensureRemoteServer(): Promise<
  RemoteStatus & { persisted: boolean }
> {
  ensureTauri();
  if (!ensureInflight) {
    ensureInflight = (async () => {
      await ensureSchema().catch(() => false);
      const [savedPin, savedPort] = await Promise.all([
        getSetting(REMOTE_PIN_KEY).catch(() => null),
        getSetting(REMOTE_PORT_KEY).catch(() => null),
      ]);
      const pin =
        savedPin && /^\d{4}$/.test(savedPin.trim()) ? savedPin.trim() : undefined;
      const port =
        savedPort && /^\d+$/.test(savedPort.trim()) && Number(savedPort) > 0
          ? Number(savedPort)
          : undefined;
      const status = await remoteStart(port, pin);
      // Grava o efetivo (cobre o PIN gerado no primeiro boot).
      const [pinOk, portOk] = await Promise.all([
        setSetting(REMOTE_PIN_KEY, status.pin).catch(() => false),
        setSetting(REMOTE_PORT_KEY, String(status.port)).catch(() => false),
      ]);
      return { ...status, persisted: pinOk && portOk };
    })();
  }
  try {
    return await ensureInflight;
  } finally {
    ensureInflight = null;
  }
}
