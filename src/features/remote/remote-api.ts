import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/tauri";
import type { RemoteStatus, RemoteSyncPayload } from "./types";

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
  return invoke<RemoteStatus>("remote_regen_pin");
}

/** Espelho do operador → broadcast para os celulares. Silencioso fora do Tauri. */
export async function remoteSync(payload: RemoteSyncPayload): Promise<void> {
  if (!isTauri()) return;
  await invoke("remote_sync", { payload });
}
