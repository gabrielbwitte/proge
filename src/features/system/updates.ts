import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/tauri";
import pkg from "../../../package.json";

const GITHUB_REPO = "gabrielbwitte/proge";
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface UpdateInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string;
  notes: string;
  publishedAt: string;
}

interface GithubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
}

/** Versão do app: Tauri (tauri.conf) ou package.json no browser. */
export async function getAppVersion(): Promise<string> {
  if (isTauri()) {
    try {
      return await getVersion();
    } catch {
      // cai para o package.json abaixo
    }
  }
  return pkg.version;
}

function normalize(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((p) => parseInt(p.replace(/[^0-9].*$/, ""), 10) || 0);
}

/** true se `latest` for mais nova que `current`. */
export function isNewer(current: string, latest: string): boolean {
  const a = normalize(current);
  const b = normalize(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y !== x) return y > x;
  }
  return false;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const current = await getAppVersion();
  let res: Response;
  try {
    res = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch {
    throw new Error("Sem conexão com a internet.");
  }
  if (res.status === 404) {
    throw new Error("Nenhuma release publicada no GitHub ainda.");
  }
  if (res.status === 403) {
    throw new Error("Limite da API do GitHub atingido. Tente mais tarde.");
  }
  if (!res.ok) {
    throw new Error(`GitHub retornou erro (${res.status}).`);
  }
  const release = (await res.json()) as GithubRelease;
  const latest = release.tag_name.replace(/^v/i, "");
  return {
    current,
    latest,
    updateAvailable: isNewer(current, latest),
    releaseUrl: release.html_url,
    notes: release.body ?? "",
    publishedAt: release.published_at ?? "",
  };
}

/** Abre a página da release no navegador padrão. */
export async function openRelease(url: string): Promise<void> {
  if (isTauri()) {
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
