// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMarker,
  clearPin,
  fetchRemoteState,
  hasStoredPin,
  mediaUrl,
  resolveApiBase,
  resolvePin,
  savePin,
  sendRemoteAction,
  storageSelfTest,
} from "./client";

function setHash(hash: string): void {
  window.history.replaceState(null, "", `/${hash}`);
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("armazenamento do PIN (localStorage)", () => {
  it("round-trip com trim", () => {
    savePin(" 1234 ");
    expect(resolvePin()).toBe("1234");
    expect(hasStoredPin()).toBe(true);
    expect(storageSelfTest()).toBe(true);
  });

  it("vazio quando nada guardado", () => {
    expect(resolvePin()).toBe("");
    expect(hasStoredPin()).toBe(false);
  });

  it("valor guardado inválido é ignorado", () => {
    window.localStorage.setItem("proge.remote_pin", "abc");
    expect(resolvePin()).toBe("");
    expect(hasStoredPin()).toBe(false);
  });

  it("PIN da URL vale uma vez e sai do hash", () => {
    setHash("#/remote?pin=4321");
    expect(resolvePin()).toBe("4321");
    expect(window.location.hash).not.toContain("pin");
    // Segunda leitura vem do armazenamento, sem reler a URL.
    expect(resolvePin()).toBe("4321");
  });

  it("PIN da URL inválido cai para o armazenado", () => {
    savePin("1111");
    setHash("#/remote?pin=12ab");
    expect(resolvePin()).toBe("1111");
    expect(window.location.hash).not.toContain("pin");
  });

  it("clearPin limpa storage e hash, preservando outros params", () => {
    savePin("2222");
    setHash("#/remote?pin=2222&api=http://1.2.3.4:8080");
    clearPin();
    expect(window.localStorage.getItem("proge.remote_pin")).toBeNull();
    expect(window.location.hash).not.toContain("pin");
    expect(window.location.hash).toContain("api=");
    expect(resolvePin()).toBe("");
  });
});

describe("base da API", () => {
  it("padrão é a origem da página", () => {
    setHash("#/remote");
    expect(resolveApiBase()).toBe(window.location.origin);
  });

  it("override ?api= com trim de barras", () => {
    setHash("#/remote?api=http://192.168.0.10:8080///");
    expect(resolveApiBase()).toBe("http://192.168.0.10:8080");
  });
});

describe("utilidades", () => {
  it("mediaUrl codifica path e pin", () => {
    const url = mediaUrl("http://1.2.3.4:8080", "1234", "/fotos/a b.jpg");
    expect(url).toBe(
      "http://1.2.3.4:8080/media?path=%2Ffotos%2Fa%20b.jpg&pin=1234",
    );
  });

  it("buildMarker nunca é vazio", () => {
    expect(buildMarker().length).toBeGreaterThan(0);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("protocolo autenticado (fetch mockado)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetchRemoteState envia Bearer com trim e devolve o estado", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(200, { state: { module: "biblia" } }),
    );
    const state = await fetchRemoteState("http://srv", " 1234 ");
    expect(state).toEqual({ module: "biblia" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://srv/api/state",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer 1234",
        }),
      }),
    );
  });

  it("401 vira erro de PIN inválido", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, {}));
    await expect(fetchRemoteState("http://srv", "0000")).rejects.toThrow(
      /PIN inválido/,
    );
  });

  it("outro status vira falha de carregamento", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, {}));
    await expect(fetchRemoteState("http://srv", "1234")).rejects.toThrow(
      /Falha ao carregar \(500\)/,
    );
  });

  it("sendRemoteAction posta a ação e superfície o erro do servidor", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await sendRemoteAction("http://srv", "1234", {
      type: "module",
      module: "biblia",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ type: "module", module: "biblia" }));

    fetchMock.mockResolvedValue(jsonResponse(400, { error: "módulo inválido" }));
    await expect(
      sendRemoteAction("http://srv", "1234", {
        type: "module",
        module: "biblia",
      }),
    ).rejects.toThrow("módulo inválido");
  });

  it("sendRemoteAction sem JSON de erro usa o status", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("sem json");
      },
    } as unknown as Response);
    await expect(
      sendRemoteAction("http://srv", "1234", { type: "clear" }),
    ).rejects.toThrow("Falha (503).");
  });
});
