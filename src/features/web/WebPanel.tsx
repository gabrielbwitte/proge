import * as React from "react";
import { ExternalLink, Globe, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isTauri } from "@/lib/tauri";
import { useProjection } from "../projection/store";
import type { ProjectableItem } from "../projection/types";
import { parseWebUrl, previewEmbedUrl } from "./web-url";
import {
  createWebLink,
  deleteWebLink,
  listWebLinks,
  updateWebLink,
  type WebLink,
} from "./web-repo";
import { cn } from "cn";

function toItems(links: WebLink[]): ProjectableItem[] {
  return links.map((l) => {
    let embed = l.url;
    try {
      embed = parseWebUrl(l.url).embedUrl;
    } catch {
      // Link legado inválido: projeta a URL crua e o telão mostra o erro.
    }
    return {
      id: String(l.id),
      kind: "web" as const,
      title: l.title,
      body: l.title,
      ref: l.url,
      mediaUrl: embed,
    };
  });
}

export function WebPanel() {
  const { items, selectedIndex, setItems, selectIndex } = useProjection();
  const [links, setLinks] = React.useState<WebLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const selectedRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, items]);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listWebLinks();
      setLinks(rows);
      setItems(toItems(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar os links.");
    } finally {
      setLoading(false);
    }
  }, [setItems]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const openForm = (link?: WebLink) => {
    setEditingId(link?.id ?? null);
    setTitle(link?.title ?? "");
    setUrl(link?.url ?? "");
    setFormError("");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setTitle("");
    setUrl("");
    setFormError("");
  };

  const save = async () => {
    const cleanTitle = title.trim() || "Sem título";
    setSaving(true);
    setFormError("");
    try {
      const parsed = parseWebUrl(url);
      if (editingId == null) {
        await createWebLink({ title: cleanTitle, url: parsed.sourceUrl, kind: parsed.kind });
      } else {
        await updateWebLink(editingId, {
          title: cleanTitle,
          url: parsed.sourceUrl,
          kind: parsed.kind,
        });
      }
      closeForm();
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Falha ao salvar o link.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (link: WebLink) => {
    if (!window.confirm(`Apagar "${link.title}"?`)) return;
    try {
      await deleteWebLink(link.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao apagar o link.");
    }
  };

  const openExternal = async (rawUrl: string) => {
    try {
      if (isTauri()) {
        await openUrl(rawUrl);
      } else {
        window.open(rawUrl, "_blank", "noopener");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao abrir o link.");
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-4 text-sm text-muted-foreground lg:px-6">
        Carregando links…
      </div>
    );
  }

  const selectedLink = links[selectedIndex] ?? null;
  const selectedItem = items[selectedIndex] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4 lg:px-6">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">
          {links.length} {links.length === 1 ? "link" : "links"} · projeta em tela cheia no telão
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={reload}>
            Recarregar
          </Button>
          <Button size="sm" onClick={() => openForm()} className="bg-green-700 hover:bg-green-800">
            <Plus />
            <span>Adicionar</span>
          </Button>
        </div>
      </div>

      {!isTauri() ? (
        <Card>
          <CardHeader>
            <CardTitle>Modo navegador</CardTitle>
            <CardDescription>
              A lista de links exige o SQLite (`npm run tauri dev`). Neste modo dá para
              visualizar, mas não salvar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Algo falhou</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {formOpen ? (
        <Card className="shrink-0">
          <CardHeader className="flex flex-col gap-3">
            <CardTitle>{editingId == null ? "Novo link" : "Editar link"}</CardTitle>
            <CardDescription>
              Cole um link do YouTube (watch, youtu.be, shorts, live) ou qualquer página
              (ex.: apresentação, site). O telão abre em tela cheia com autoplay.
            </CardDescription>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="web-title">Título</Label>
                <Input
                  id="web-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Louvor — Quão grande é o meu Deus"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="web-url">Link</Label>
                <Input
                  id="web-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  inputMode="url"
                />
              </div>
              {formError ? (
                <p className="text-sm text-destructive">{formError}</p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={closeForm} disabled={saving}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={save} disabled={saving} className="bg-green-700 hover:bg-green-800">
                  {saving ? "Salvando…" : editingId == null ? "Adicionar" : "Salvar"}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {links.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum link ainda</CardTitle>
            <CardDescription>
              Clique em Adicionar e cole o link do vídeo ou página que será projetado.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
          <ScrollArea className="h-full min-h-0 w-full flex-1 rounded-md border lg:max-w-md">
            <div className="flex flex-col gap-1 p-2">
              {links.map((link, i) => (
                <div
                  key={link.id}
                  ref={i === selectedIndex ? selectedRef : null}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectIndex(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") selectIndex(i);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-2 outline-none transition hover:bg-muted/60 focus-visible:border-ring",
                    i === selectedIndex && "border-transparent bg-muted ring-2 ring-green-700",
                  )}
                >
                  <span className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-xs font-semibold">
                    {link.kind === "youtube" ? (
                      <span className="flex h-full w-full items-center justify-center bg-black text-white" aria-hidden>
                        <Play className="size-4" />
                      </span>
                    ) : (
                      <Globe className="size-4 text-muted-foreground" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{link.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {link.kind === "youtube" ? "YouTube · " : ""}{link.url}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Abrir no navegador"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openExternal(link.url);
                      }}
                    >
                      <ExternalLink />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Editar"
                      onClick={(e) => {
                        e.stopPropagation();
                        openForm(link);
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Apagar"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(link);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="hidden min-h-0 flex-1 flex-col gap-2 lg:flex">
            <p className="shrink-0 truncate text-sm text-muted-foreground">
              Pré-visualização — {selectedLink ? selectedLink.title : "nada selecionado"}
            </p>
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-black">
              {selectedItem?.mediaUrl ? (
                <iframe
                  key={previewEmbedUrl(selectedItem.mediaUrl)}
                  src={previewEmbedUrl(selectedItem.mediaUrl)}
                  title={selectedItem.title}
                  className="h-full w-full border-0 bg-white"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  Selecione um link para pré-visualizar a página aqui antes de projetar.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
