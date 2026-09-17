<p align="center">
  <img src="./public/proge-icon.svg" width="128" height="128" alt="Ícone do Proge — projetor com telão e cruz" />
</p>

<h1 align="center">Proge</h1>

<p align="center">
  App desktop de projeção para igrejas. Janela do operador + telões fullscreen espelhados.<br />
  Offline-first, SQLite local, sem cadastro.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square" alt="TypeScript 6" />
  <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square" alt="Tailwind v4" />
</p>

Proge é o operador de mídia da igreja: projeta **Bíblia**, **Letras**, **Fotos**, **Vídeos** e **Fundos** por categoria em até 3 telões. A janela do operador nunca projeta sozinha — só os botões **Projetar** / **Limpar** (e seus atalhos) alteram a saída de vídeo.

---

## Apresentação

### Para quem é
Operador de mídia / ministro de louvor que precisa trocar versículo, letra, foto ou vídeo **sem travar** e **sem internet** no culto.

### O que faz
- **Bíblia** — 66 livros, busca local instantânea. Download de traduções PT-BR (ARA, NVI, etc.) via Bolls.life em 1 requisição (~31k versículos), com progresso e retomada de capítulos já salvos.
- **Letras** — biblioteca local + busca remota (LouvorJA + LRCLIB) sem token. Repertório em memória, divisão automática em seções/estrofes e projeção verso a verso.
- **Fotos / Vídeos** — escolhe pastas locais, navega em grade com thumbnails (vídeo com captura via canvas), `loop`/`mute` e projeção `image`/`video`.
- **Fundo (wallpaper) por categoria** — 3 wallpapers da pasta de Fotos: *Padrão* (telão limpo), *Bíblia* e *Letra*. Troca automática ao projetar texto; `image`/`video` nunca recebem wallpaper.
- **Telões espelhados** — renderiza o mesmo conteúdo em `stage`, `stage-2` e `stage-3` (`WebviewWindow` fullscreen sem decoração). No browser funciona via `window.open` + `BroadcastChannel`.
- **Telões → Monitores** — detecta monitores (`availableMonitors`), mostra mapa SVG proporcional com resolução/aspect/posição e saídas automáticas ordenadas por x/y (sem arrastar manualmente).
- **Sistema** — verificação de atualizações com comparação semântica e **instalação automática**: o app baixa, instala e reinicia sozinho (com barra de progresso).

### Fluxo do operador
`Anterior / Próximo` (ou `← → / PageUp PageDown / Espaço`) só navegam localmente. `Enter` projeta o item selecionado, `Esc` limpa o telão. O footer mostra `AO VIVO` e anima `proge-press` a cada atalho. Tudo cabe na viewport — listas rolam internamente em `ScrollArea`, footer permanece `sticky`.

---

## Instalação

### Pré-requisitos
- **Node.js** 20+ e **npm**
- **Rust** estável + toolchain Tauri (ver [prerequisites Tauri v2](https://tauri.app/start/prerequisites/))
- macOS: Xcode Command Line Tools. Windows: WebView2 + Build Tools. Linux: `webkit2gtk`/`libsoup` etc.

### 1. Clonar e instalar
```bash
git clone https://github.com/gabrielbwitte/proge.git
cd proge
npm install
```

### 2. Rodar em desenvolvimento
```bash
# web-only (sem APIs Tauri) — http://localhost:1420
npm run dev

# desktop completo (obrigatório para SQLite, FS, Dialog, telões)
npm run tauri dev
```
> `vite.config.ts` usa `port: 1420` com `strictPort: true` — se a porta estiver ocupada o dev falha. `src-tauri/**` é ignorado pelo watcher do Vite: mudanças em Rust exigem reiniciar `tauri dev`.

### 3. Build
```bash
# checagem de tipos + bundle web (saída em dist/ — é o frontendDist do Tauri)
npm run build

# bundle desktop de produção (usa npm run build internamente)
npm run tauri build
```
> `tsconfig.json` é `strict` com `noUnusedLocals` + `noUnusedParameters` — qualquer import/var/parâmetro não usado quebra o build.

### CLI Tauri
Não existe binário `tauri` standalone. Todo acesso é via npm script:
```bash
npm run tauri -- --help
npm run tauri -- info
```

---

## Atualizando o app (operador)

Com o Proge instalado na máquina, não é preciso baixar nada manualmente:

1. Abra **Configuração → Sistema**.
2. Clique em **Verificar atualizações**.
3. Se houver versão nova, clique em **Baixar e instalar**.
4. Acompanhe a barra de progresso (`Baixando X%…`). Não feche o app.
5. Ao terminar, o app **reinicia sozinho** já na nova versão (no Windows o instalador pode pedir confirmação do sistema).

> Sem internet, o app mostra "Sem conexão com a internet". Se algo falhar, use o botão **Baixar no GitHub** como alternativa.

## Publicando uma release (mantenedor)

Cada tag `v*` dispara o workflow `.github/workflows/release.yml`, que compila para macOS/Windows/Linux, **assina** os artefatos e publica a Release com o `latest.json` — é esse arquivo que o app consulta no update.

```bash
# 1. Sincronizar a versão nos dois arquivos
#    package.json ("version") e src-tauri/tauri.conf.json ("version")
# 2. Commitar, taguear e enviar
git tag v0.2.0
git push origin v0.2.0
```

### Chaves de assinatura (configuração única)

```bash
# Gera o par de chaves (privada fora do repo!)
npm run tauri -- signer generate -w ~/.tauri/proge.key --ci
```

- A **pública** (`~/.tauri/proge.key.pub`) vai em `src-tauri/tauri.conf.json → plugins.updater.pubkey`.
- A **privada** vai em GitHub **Settings → Secrets → Actions**:
  - `TAURI_SIGNING_PRIVATE_KEY` = conteúdo de `~/.tauri/proge.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = senha (deixe vazio se a chave não tem senha)

> ⚠️ Se perder a chave privada, as versões já instaladas **não conseguem mais atualizar** — será preciso trocar a `pubkey`, publicar release nova e avisar os operadores.

---

## Tecnologias usadas

| Camada | Tech | Detalhes |
|---|---|---|
| **Frontend** | React 19 + TypeScript 6 + Vite 8 | `tsx`, `strict`, path alias `@/*` → `src/*` |
| **Estilo** | Tailwind CSS v4 + shadcn `base-vega` + Base UI | CSS-first em `src/App.css` (`@import "tailwindcss"`, `@theme inline`), `tailwind.config.js` é stub vazio; dark via `@custom-variant dark`; fontes `@fontsource-variable/dm-sans`/`outfit`/`inter`; animação `proge-press` |
| **UI libs** | `lucide-react`, `zod`, `sonner`, `recharts`, `@dnd-kit/*`, `@tanstack/react-table` | Ícones, validação, toasts, gráficos, drag-and-drop, tabelas |
| **Backend** | Rust + Tauri v2 | `tauri` com `features=["protocol-asset"]`; `src-tauri/src/lib.rs` registra `greet` via `generate_handler!` |
| **Plugins Tauri** | `tauri-plugin-sql` (`sqlite`), `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-opener` | `plugins.sql.preload: ["sqlite:proge.db"]`; `assetProtocol.scope.allow: ["**"]` para `convertFileSrc` |
| **Banco** | SQLite (`tauri-plugin-sql`) | Schema em `src/db/schema.ts` (tabelas `bible_versions`, `books`, `verses`, `songs`, `song_sections`, `app_settings`); acesso via `src/db/client.ts` (`ensureSchema` idempotente) e `settings-repo.ts` (`ON CONFLICT`) |
| **Bíblia API** | Bolls.life (`https://bolls.life`) | Sem token. `languages.json` → `get-books/<slug>` → `static/translations/<slug>.json` (tradução completa em 1 request); `stripHtml` limpa tags |
| **Letras APIs** | LouvorJA (`api.louvorja.com.br`) + LRCLIB (`lrclib.net`) | Sem token, merge `Promise.allSettled` + dedupe `title|artist`; Vagalume descartado (exige `apikey`) |
| **Projeção** | Event bus + BroadcastChannel | `emit("proge:project"|"proge:clear")` via `@tauri-apps/api/event` + `BroadcastChannel("proge-stage")` fallback; `ProjectionProvider` separa navegação local (`selectNext/Prev`) de emissão (`projectSelected`/`clear`) |
| **Telões** | `WebviewWindow` + hash `#/stage` | Mesma bundle, `isStageRoute()` em `src/App.tsx` renderiza `StageView` isolado; `STAGE_LABELS = ["stage","stage-2","stage-3"]` com `getByLabel` idempotente; `monitors.ts` via `availableMonitors().toLogical(scaleFactor)` |

### Estrutura
```
src/main.tsx → src/App.tsx → src/app/dashboard/page.tsx
src/components/         # shell (app-sidebar, site-header, site-footer)
src/components/ui/      # primitivos shadcn
src/lib/tauri.ts        # isTauri()
src/db/                 # schema, client, settings-repo
src/features/
  biblia/ | letras/ | media/ | fundo/ | projection/ | stage/ | system/
  modules/panels.tsx    # barrel + ConfigPanel (tabs biblia/letras/midia/teloes/sistema)
src-tauri/              # tauri.conf.json, capabilities/default.json, Cargo.toml
```

### Scripts
| Script | O que faz |
|---|---|
| `npm run dev` | Vite web-only |
| `npm run tauri dev` | Desktop dev com hot-reload + APIs nativas |
| `npm run build` | `tsc && vite build` → `dist/` |
| `npm run tauri build` | Bundle instalável |

---

