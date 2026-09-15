// Atualização in-place via tauri-plugin-updater (assinada).
// Usado pelo UpdateCard quando roda no Tauri; no browser mantém o fallback
// de abrir a release no GitHub (openRelease em updates.ts).
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface InstallProgress {
  downloaded: number;
  /** Total em bytes, quando o servidor informa (evento Started). */
  total: number | null;
}

/** Retorna a versão disponível no latest.json, ou null se já está em dia. */
export async function checkNativeUpdate(): Promise<{
  version: string;
  notes: string;
} | null> {
  const update = await check();
  if (!update) return null;
  const info = { version: update.version, notes: update.body ?? "" };
  await update.close();
  return info;
}

/**
 * Baixa, instala e reinicia o app na nova versão.
 * No Windows o instalador encerra o app sozinho; no macOS/Linux
 * fazemos `relaunch()` após instalar.
 */
export async function downloadInstallAndRelaunch(
  onProgress: (p: InstallProgress) => void,
): Promise<void> {
  const update = await check();
  if (!update) throw new Error("Nenhuma atualização encontrada.");
  let downloaded = 0;
  let total: number | null = null;
  const emit = () => onProgress({ downloaded, total });
  const onEvent = (e: DownloadEvent) => {
    if (e.event === "Started") {
      total = e.data.contentLength ?? null;
    } else if (e.event === "Progress") {
      downloaded += e.data.chunkLength;
    }
    emit();
  };
  try {
    await update.downloadAndInstall(onEvent);
  } finally {
    await update.close();
  }
  await relaunch();
}

/** Traduz erros técnicos do updater para mensagens do operador. */
export function describeUpdaterError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("dns") ||
    lower.includes("connection")
  ) {
    return "Sem conexão com a internet.";
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return "Nenhuma release publicada no GitHub ainda.";
  }
  if (lower.includes("403") || lower.includes("rate limit")) {
    return "Limite da API do GitHub atingido. Tente mais tarde.";
  }
  if (lower.includes("signature") || lower.includes("sign")) {
    return "Assinatura da atualização inválida. Baixe pelo GitHub.";
  }
  return msg || "Falha ao instalar a atualização.";
}
