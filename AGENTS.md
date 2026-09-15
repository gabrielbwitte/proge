# AGENTS.md — Proge

> App desktop de projeção para igrejas. Janela do operador (controle) + janelas de saída fullscreen (telões) espelhadas. Offline-first com SQLite local.

## 1. Visão geral

- **Produto:** Tauri v2 app — Bíblia, Letras, Fotos, Vídeos e Fundos (wallpapers por categoria) projetados em 1..3 telões. A janela do operador nunca projeta sozinha; só `Projetar`/`Limpar` alteram os telões.
- **Público:** operador de mídia / ministro de louvor.
- **Repositório:** `gabrielbwitte/proge` — verificação de atualizações via `api.github.com/repos/.../releases/latest`.

## 2. Stack e versões

- **Frontend:** React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4 + shadcn (`base-vega`) + Base UI (`@base-ui/react`) + `@fontsource-variable/*`.
- **Backend:** Rust / Tauri v2 (`tauri-plugin-opener`, `tauri-plugin-sql` com `sqlite`, `tauri-plugin-dialog`, `tauri-plugin-fs`).
- **Libs extras:** `lucide-react`, `zod`, `sonner`, `recharts`, `@dnd-kit/*`, `@tanstack/react-table`.
- **Sem testes/lint/CI configurados.**

## 3. Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | Vite web-only, porta `1420` (`strictPort:true` — falha se ocupada) |
| `npm run tauri dev` | Desktop dev (executa `beforeDevCommand`). **Obrigatório** para qualquer API Tauri |
| `npm run build` | `tsc && vite build` → `dist/` (`frontendDist` do Tauri). `tsc` com `strict` quebra o build |
| `npm run tauri build` | Bundle desktop de produção |
| `npm run tauri -- <args>` | Único acesso ao CLI Tauri (não existe binário `tauri` standalone) |

## 4. Typecheck — rigor máximo

`tsconfig.json`: `strict:true`, `noUnusedLocals:true`, `noUnusedParameters:true`, `noFallthroughCasesInSwitch:true`.
`npm run build` falha com qualquer import/var/parâmetro não usado — limpar tudo antes de finalizar. Não deixe `_` não usado sem prefixar.

## 5. Estrutura de pastas

```
src/main.tsx → src/App.tsx → src/app/dashboard/page.tsx
src/components/         # shell do app (app-sidebar, site-header, site-footer, nav-*)
src/components/ui/      # primitivos shadcn (button, tabs, scroll-area, sidebar, ...)
src/lib/tauri.ts        # isTauri()
src/hooks/              # use-mobile
src/db/                 # SQLite (schema, client, settings-repo)
src/features/
  biblia/               # Bíblia (api Bolls.life, bible-repo, download, BibliaPanel, BibleSettings)
  letras/               # Letras (api LouvorJA+LRCLIB, songs-repo, provider, LetrasPanel, LyricsSettings)
  media/                # Fotos/Vídeos (media-repo, FotosPanel, VideosPanel, MediaSettings)
  fundo/                # Wallpapers por categoria (fundo-repo, FundoPanel)
  projection/           # Núcleo de projeção (types, store, events, useProjectionShortcuts)
  stage/                # Telões (StageView, stage-window, monitors, MonitorManager)
  system/               # Atualizações (updates, UpdateCard)
  modules/panels.tsx    # Barrel + ConfigPanel (tabs biblia/letras/midia/teloes/sistema)
src-tauri/
  src/lib.rs            # run(), plugins, invoke_handler
  src/main.rs
  capabilities/default.json
  tauri.conf.json
```

## 6. Alias e imports

- Path alias `@/*` → `src/*` definido em `vite.config.ts` **e** `tsconfig.json`. Sempre usar `@/`, ex: `import { Button } from "@/components/ui/button"`.
- `components.json` aliases: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`.
- Shadcn `style: base-vega`, `tailwind.css: src/App.css`, `baseColor: neutral`, `iconLibrary: lucide`.

## 7. Estilização

- **Tailwind v4, CSS-first:** tema/tokens vivem em `src/App.css` (`@import "tailwindcss"`, `@theme inline`, vars shadcn). `tailwind.config.js` é stub vazio — não adicionar tema lá.
- **Dark mode:** `@custom-variant dark (&:is(.dark *))` + classe `.dark`.
- **Fontes:** `@fontsource-variable/dm-sans|outfit|inter` importadas em `App.css`.
- **Animação de atalho:** `@keyframes proge-press` (scale 0.93, 180ms) + classe `.proge-press` disparada pelo footer.
- **Padrão de layout para caber na viewport:** containers flex precisam `flex min-h-0 flex-1 overflow-hidden` + `ScrollArea` com `min-h-0 flex-1`. Tabs internos usam `h-full min-h-0 overflow-hidden`. Ver `FundoPanel` como referência.

## 8. Tauri — configuração

### `tauri.conf.json`
- `devUrl: http://localhost:1420`, `beforeDevCommand: npm run dev`, `beforeBuildCommand: npm run build`, `frontendDist: ../dist` — manter porta sincronizada com `vite.config.ts`.
- `plugins.sql.preload: ["sqlite:proge.db"]`.
- `app.windows: [{ label: "main", title: "Proge", width:1200, height:800 }]`. Telões são `WebviewWindow` criados em runtime (`stage`, `stage-2`, `stage-3`).
- `app.security.assetProtocol: { enable:true, scope:{ allow:["**"] } }` — necessário para `convertFileSrc` de imagens/vídeos locais.
- `bundle.targets: all` + `bundle.createUpdaterArtifacts: true` (gera `.zip/.sig` + `latest.json` para o auto-update).

### Updater (auto-update)
- `plugins.updater: { active:true, dialog:false, endpoints:["https://github.com/gabrielbwitte/proge/releases/latest/download/latest.json"], pubkey:"<minisign pub>" }`.
- Chave privada **fora do repo** em `~/.tauri/proge.key` (gerada com `npm run tauri -- signer generate -w ~/.tauri/proge.key --ci`); no CI vai em Secrets `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD` se houver senha). Se perder a chave, updates param de funcionar — gerar novo par exige trocar `pubkey` e publicar release nova.
- Sem assinatura válida o updater recusa o pacote; `dialog:false` porque o `UpdateCard` tem UI própria com progresso.

### `Cargo.toml` / `lib.rs`
- `tauri` com `features=["protocol-asset"]`.
- Plugins: `tauri-plugin-sql { features=["sqlite"] }`, `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-opener`, `tauri-plugin-updater`, `tauri-plugin-process` (relaunch pós-update).
- Em `lib.rs`: `.plugin(tauri_plugin_fs::init()).plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_sql::Builder::new().build())...plugin(tauri_plugin_updater::Builder::new().build()).plugin(tauri_plugin_process::init())...invoke_handler![greet]`.

### `capabilities/default.json`
- `windows: ["main","stage","stage-2","stage-3"]`.
- `permissions: core:default, core:window:default, core:webview:default, core:event:default, opener:default, updater:default, process:default, sql:default, sql:allow-execute (obrigatório — sem isso `execute` falha silenciosamente), dialog:default, fs:default + fs:allow-read-dir/read-file/stat/exists + fs:scope-{home,picture,video,desktop,download}-recursive`.

### Gotchas Tauri
- Vite ignora `src-tauri/**` no watcher — mudanças Rust exigem reiniciar `tauri dev`.
- `src-tauri/gen/` e `src-tauri/target/` são gerados — nunca editar.
- `WebviewWindow` dinâmico exige janela listada em `capabilities.windows`.

## 9. Banco de dados (SQLite via `tauri-plugin-sql`)

- **Fonte da verdade:** `src/db/schema.ts` (`SCHEMA_STATEMENTS`).
- **Tabelas:** `bible_versions(version PK, name, lang, downloaded_at)`, `books(abbrev, version PK, name, chapters, testament, ord)`, `verses(version, book, chapter, number PK, text)` + índice `idx_verses_chapter`, `songs(id PK, title, artist, source, external_id, search_text)`, `song_sections(song_id, ord PK, label, body)`, `app_settings(key PK, value)`.
- **Acesso:** `src/db/client.ts` (`getDatabase(): Database | null`, `ensureSchema()` idempotente, fallback para browser sem Tauri), `src/db/settings-repo.ts` (`getSetting/setSetting` com `ON CONFLICT`).
- **Chaves `app_settings`:** `bible.selectedVersion`, `fundo.wallpapers` (JSON `FundoWallpapers`), `photos.dir`/`videos.dir` (pastas escolhidas), `videos.loop`/`videos.muted`, prefs de louvor etc.
- **Regra:** nunca quebrar compatibilidade do schema sem migração; `books` usa `bookid` (1..66) como `ord` para ordenação canônica.

## 10. Arquitetura de projeção (núcleo)

### Tipos (`src/features/projection/types.ts`)
- `ModuleId: "biblia"|"letras"|"fotos"|"videos"|"fundo"|"configuracao"`.
- `ProjectionKind: "text"|"image"|"video"|"blank"`.
- `StageTheme { background, foreground, fontSize, backgroundImage? }`, `VideoOpts { loop, muted }`.
- `FundoCategory: "padrao"|"biblia"|"letra"` + `FundoWallpapers: Partial<Record<FundoCategory,string>>` (paths de arquivo).
- `ProjectPayload { kind, title, body, ref?, mediaUrl?, theme?, videoOpts?, category? }`.
- `ProjectableItem { id, kind, title, body, ref?, mediaUrl?, videoOpts?, category? }`.
- `DEFAULT_STAGE_THEME: { background:"#000", foreground:"#fff", fontSize:64 }`.

### Store (`src/features/projection/store.tsx`)
- `ProjectionProvider` expõe `items`, `selectedIndex`, `projected`, `live`, `canPrev/Next/Project`, `setItems`, `selectIndex/Next/Prev`, `projectSelected`, `projectTest`, `clear`.
- **Regra de ouro:** `selectNext/Prev/Index` são navegação **local** — nunca emitem para o telão. Só `projectSelected`/`clear` (/`projectTest`) chamam `emitProject`/`emitClear` e alteram `live`/`projected`.
- Wallpaper por categoria: `wallpaperFor()` resolve `media-repo.resolveAssetUrl()` (ou `convertFileSrc` em Tauri). `image`/`video` ignoram wallpaper; `text` injeta `theme.backgroundImage` (categoria → `wallpapers.biblia/letra`, fallback `padrao`). Cache em `wallpapersRef` sincronizado via evento `fundo:wallpapers`.

### Event bus (`src/features/projection/events.ts`)
- `emitProject(payload)` / `emitClear()` → `emit("proge:project"|"proge:clear")` via `@tauri-apps/api/event` + `BroadcastChannel("proge-stage")` fallback browser.
- `StageView` escuta ambos e renderiza.

### Atalhos (`src/features/projection/useProjectionShortcuts.ts`)
- `ArrowLeft/PageUp → prev`, `ArrowRight/PageDown/Space → next`, `Enter → project` (ignora `e.repeat`), `Esc → clear`. Animação `proge-press` via `CustomEvent("proge:shortcut")` no footer; badge `NO AR` em `SiteFooter`.

## 11. Telões (multi-window)

- **Roteamento:** mesma bundle; hash `#/stage` detectado em `src/App.tsx` (`isStageRoute()`) renderiza `StageView` isolado. Operador em `#/` (ou sem hash).
- **Janela:** `src/features/stage/stage-window.ts` (`STAGE_LABELS = ["stage","stage-2","stage-3"]`, `openStage(label)` idempotente via `WebviewWindow.getByLabel(label)?.setFocus()` ou `new WebviewWindow(label,{url:"index.html#/stage", fullscreen:true, decorations:false, skipTaskbar:true})`, `closeStage/closeAllStages`). Fallback browser: `window.open(...#/stage)`.
- **StageView:** fundo `theme.backgroundImage` com `cover/center` quando projetado `text` com categoria, ou `padrao` quando `!live`. Imagem/vídeo usam `mediaUrl` direto.
- **Monitores:** `src/features/stage/monitors.ts` (`MonitorInfo {key,name,width,height,x,y,aspect}`, `aspectRatio()` com MDC, `listMonitors()` via `availableMonitors().toLogical(scaleFactor)`, `currentMonitorKey()`, `autoOutputs()` filtra operador e ordena por x/y, `placeStageOn(monitor)` fullscreen, `applyLayout()`). `MonitorManager.tsx` mostra mapa SVG proporcional + specs (resolução, aspect, posição) e lista de saídas automáticas (sem ordenação manual).

## 12. Módulos de conteúdo

### Bíblia (`src/features/biblia/`)
- **API:** Bolls.life (`https://bolls.life`) — sem token. Endpoints: `/static/bolls/app/views/languages.json` → `fetchTranslations()` filtra `language==="Portuguese"`, `/get-books/<slug>/`, `/static/translations/<slug>.json` (tradução completa ~31k versículos em 1 request) → `fetchFullTranslation()`, `stripHtml()` remove tags. Não raspar capítulo a capítulo.
- **Repo:** `bible-repo.ts` (`saveBooks` com `bookid`, `saveChapter` batch 200, `listVersions`, `downloadedVersesCount`, `markDownloaded/deleteVersion`).
- **Download:** `download.ts` agrupa `Map<book:chapter, FullVerse[]>`, progresso por fase `books/fetch/save/finish`, throttle 150ms, retoma capítulos já salvos, só marca `downloaded_at` em 100%.
- **UI:** `BibliaPanel` (`w-96` selects + labels, `ScrollArea h-full`) e `BibleSettings` (lista com progresso + Cancelar/Apagar + `describeError` para IPC).

### Letras (`src/features/letras/`)
- **APIs:** `LouvorJA (https://api.louvorja.com.br/pt/musics?search=&limit=10)` primária (gospel/harpa) + `LRCLIB (https://lrclib.net/api/search?q= & /api/get/<id>)` fallback — ambas sem token. Vagalume descartado (exige `apikey`). `RemoteHit {id,title,artist,source,fetchKey}`; merge `Promise.allSettled` + dedupe `title|artist` lower, LouvorJA vence. *Nota:* LouvorJA `/pt/musics` atualmente retorna `500 SQLSTATE[42S22] Unknown column 'files.host'` — degradar para `[]` e LRCLIB cobre.
- **Repo:** `songs-repo.ts` (`listSongs`, `getSong`, `createSong→lastInsertId`, `updateSong`, `findRemoteSong`, `listDownloadedRemoteIds`).
- **Provider:** `provider.ts` (`localLyricsProvider`, `remoteLyricsProvider`, `parseLyricsText/serializeSections`).
- **UI:** `LetrasPanel` grid `lg:grid-cols-[280px_300px_1fr]` — Biblioteca | Repertório (em memória `RepertoireEntry {entryId, songId}`) | Letras. Biblioteca só carrega com query (`reload("")` vazio); botão minimize `PanelLeftClose/Open` (48px). `LyricsSettings` com `Input+Pesquisar`, `ScrollArea h-full`, `Baixar/Baixada ✓`.

### Fotos/Vídeos (`src/features/media/`)
- **Repo:** `media-repo.ts` (`PHOTOS_DIR_KEY/VIDEOS_DIR_KEY`, `IMAGE_EXTS/VIDEO_EXTS`, `walk` recursivo, `convertFileSrc`/`resolveAssetUrl`, `pickDirectory` via `dialog.open`).
- **Panels:** `FotosPanel` grade de thumbnails, `VideosPanel` com `VideoThumb` (canvas capture + detecção `frameIsBlack` + retry 0.5s + 2 rAF).
- **Settings:** `MediaSettings` escolhe pastas + prefs `videos.loop/muted`.

### Fundo (`src/features/fundo/`)
- **Repo:** `fundo-repo.ts` (`getWallpapers/setWallpaper` em `app_settings` chave `fundo.wallpapers` JSON, evento `fundo:wallpapers`).
- **Panel:** `FundoPanel` tabs `Padrão/Bíblia/Letra` — cada tab preview `h-20 w-32` + grade da pasta Fotos (mesma de `MediaSettings`). Seleção com anel verde, `Remover`. Orienta configurar pasta em `Configuração → Mídia` se vazia.
- **Integração:** `BibliaPanel`/`LetrasPanel` marcam `ProjectableItem.category` (`"biblia"`/`"letra"`) para troca automática de wallpaper no `store`.

### Configuração (`src/features/modules/panels.tsx` + `src/features/system/`)
- Tabs `biblia | letras | midia | teloes | sistema`. `ConfigPanel` com `TabsContent flex min-h-0 flex-1 h-full overflow-y-auto`. `MonitorManager` e `UpdateCard` (`updates.ts`: `getAppVersion` via `@tauri-apps/api/app getVersion` fallback `package.json`, `isNewer` com normalize, `checkForUpdates` em `api.github.com/repos/gabrielbwitte/proge/releases/latest`, 404/403 tratados, `openUrl` fallback browser; `updater.ts`: `checkNativeUpdate()` / `downloadInstallAndRelaunch(onProgress)` via `@tauri-apps/plugin-updater` + `relaunch()` via `@tauri-apps/plugin-process`, erros via `describeUpdaterError`). Fluxo no clique: `Verificando → Baixando X% (Started/Progress/Finished) → Instalando → relaunch` (Windows sai sozinho pelo instalador).

## 13. Layout e shell

- `SidebarProvider` com `--sidebar-width`/`--header-height`, `SidebarInset class="h-svh overflow-hidden md:h-[calc(100svh-1rem)]"` + `SiteHeader` + `div flex min-h-0 flex-1` + `SiteFooter` (`sticky bottom-0 z-30 border-t bg-background`). Conteúdo dos módulos deve ocupar `flex-1 min-h-0 overflow-hidden` para rolar internamente.
- **Sidebar:** `AppSidebar` (`variant="inset"`, `activeModule/onModuleSelect`, ícones `lucide-react`: `BookPlus, TextInitial, Camera, Video, ImageIcon, Settings2`).

## 14. Convenções para agentes

- **Antes de alterar:** rodar `npm run build` para validar `tsc` strict; após mudanças Rust, `cargo check` (ou `npm run tauri dev`).
- **Edição de schemas/capabilities:** validar contra `src-tauri/gen/schemas/acl-manifests.json` se houver erro de permissão.
- **Novos comandos Tauri:** registrar em `src-tauri/src/lib.rs generate_handler!` + `capabilities/default.json` + chamada frontend via `@tauri-apps/api`.
- **Novos módulos:** 1) adicionar `ModuleId` em `projection/types.ts`, 2) criar `src/features/<mod>/`, 3) exportar em `modules/panels.tsx`, 4) registrar em `AppSidebar` e `dashboard/page.tsx` (`MODULE_TITLES` + `switch`).
- **Imports:** sempre `@/`; nunca relativo `../../` fora do mesmo feature.
- **Estilo:** não editar `tailwind.config.js`; todo tema em `App.css`.
- **Projeção:** nunca fazer `Anterior/Próximo` emitir para o stage; só os botões `Projetar/Limpar` (e seus atalhos).

## 15. Definition of Done

- `npm run build` passa sem erros (`tsc` + `vite build`).
- `capabilities/default.json` cobre todas as `windows` e `permissions` usadas.
- Telão espelhado funciona em `npm run tauri dev` (hash `#/stage`, `BroadcastChannel` fallback no browser) e `image/video` não recebem wallpaper.
- Listas longas rolam dentro da viewport (`ScrollArea` sem overflow da página) e footer permanece sticky.

## 16. Release e auto-update

- **Versionar:** `package.json` **e** `tauri.conf.json` juntos (o updater compara `currentVersion` do binário com `version` do `latest.json`; `updates.ts:isNewer` compara com a tag).
- **Publicar:** `git tag vX.Y.Z && git push origin vX.Y.Z` → `.github/workflows/release.yml` (matrix macOS/Windows/Linux via `tauri-action@v0`) assina com `TAURI_SIGNING_PRIVATE_KEY` e anexa artefatos + `latest.json` à Release.
- **Secrets exigidos no repo:** `TAURI_SIGNING_PRIVATE_KEY` (conteúdo de `~/.tauri/proge.key`) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (vazio se a chave não tem senha).
- **Testar update:** instalar o `.msi/.dmg` da release anterior, abrir `Configuração → Sistema → Verificar atualizações → Baixar e instalar`, validar progresso + relaunch. Em `tauri dev` o fluxo nativo não é testável (sem `latest.json` publicado o `check()` falha — esperado, cai no fallback GitHub).
- **Rotação de chave:** gerar novo par, trocar `pubkey` em `tauri.conf.json`, atualizar Secret, publicar release nova. Versões antigas com `pubkey` antiga não atualizam para a nova — avisar operadores.
