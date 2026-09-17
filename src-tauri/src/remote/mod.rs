//! Controle remoto via celular (servidor web Axum na LAN).
//!
//! - O operador (frontend) é a fonte da verdade e empurra snapshots via
//!   `remote_sync` (itens, seleção, NO AR, raízes de mídia).
//! - O Rust guarda o snapshot, valida/faz broadcast via WebSocket e serve
//!   arquivos de mídia — sem isolamento por cliente: todos os celulares
//!   recebem o mesmo conteúdo.
//! - Ações do celular chegam via `POST /api/action` ou WS e são repassadas
//!   ao operador pelo evento Tauri `proge:remote-action`.
//! - Porta/PIN persistem no `app_settings` pelo frontend
//!   (`remote.port` / `remote.pin`); o Rust os recebe nos comandos.

pub mod server;
pub mod state;

use rand::Rng;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info, warn};

use state::{RemoteStateSnapshot, RemoteSyncPayload};

use server::{router, ServerState};

/// Evento Tauri operador <- celular (ouvido pelo `useRemoteSync`).
pub const REMOTE_ACTION_EVENT: &str = "proge:remote-action";

/// Porta padrão do controle remoto.
pub const DEFAULT_REMOTE_PORT: u16 = 8080;

#[derive(Clone)]
pub struct RemoteShared {
    pub state: Arc<RwLock<RemoteStateSnapshot>>,
    pub media_roots: Arc<RwLock<Vec<String>>>,
    pub tx: broadcast::Sender<String>,
    running: Arc<RwLock<Option<RunningServer>>>,
    port: Arc<RwLock<u16>>,
    pin: Arc<RwLock<String>>,
}

struct RunningServer {
    shutdown: tokio::sync::oneshot::Sender<()>,
    handle: tauri::async_runtime::JoinHandle<()>,
}

impl RemoteShared {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel::<String>(32);
        Self {
            state: Arc::new(RwLock::new(RemoteStateSnapshot {
                module: "biblia".to_string(),
                ..Default::default()
            })),
            media_roots: Arc::new(RwLock::new(Vec::new())),
            tx,
            running: Arc::new(RwLock::new(None)),
            port: Arc::new(RwLock::new(DEFAULT_REMOTE_PORT)),
            pin: Arc::new(RwLock::new(String::new())),
        }
    }
}

/// Gera PIN de 4 dígitos (1000–9999, sem zero à esquerda).
fn generate_pin() -> String {
    rand::thread_rng().gen_range(1000..10000).to_string()
}

/// true quando `s` é um PIN válido (exatamente 4 dígitos).
fn valid_pin(s: &str) -> bool {
    s.len() == 4 && s.bytes().all(|b| b.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_pin_aceita_so_quatro_digitos() {
        assert!(valid_pin("1234"));
        assert!(valid_pin("0000"));
        for bad in ["", "123", "12345", "12a4", " 123", "123 ", "12.4"] {
            assert!(!valid_pin(bad), "{bad:?}");
        }
    }

    #[test]
    fn generate_pin_sempre_quatro_digitos_na_faixa() {
        for _ in 0..200 {
            let pin = generate_pin();
            assert!(
                pin.len() == 4 && pin.bytes().all(|b| b.is_ascii_digit()),
                "{pin:?}"
            );
            let n: u32 = pin.parse().expect("só dígitos");
            assert!((1000..10000).contains(&n));
        }
    }
}

/// IP da LAN para o QR Code (cai para 127.0.0.1 se indisponível).
pub fn lan_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn build_url(ip: &str, port: u16, pin: &str) -> String {
    format!("http://{ip}:{port}/#/remote?pin={pin}")
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct RemoteStatus {
    pub running: bool,
    pub ip: String,
    pub port: u16,
    pub url: String,
    pub pin: String,
    pub has_pin: bool,
}

async fn status_of(shared: &RemoteShared) -> RemoteStatus {
    let running = shared.running.read().await.is_some();
    let port = *shared.port.read().await;
    let pin = shared.pin.read().await.clone();
    let ip = lan_ip();
    let url = if pin.is_empty() {
        String::new()
    } else {
        build_url(&ip, port, &pin)
    };
    RemoteStatus {
        running,
        ip,
        port,
        url,
        pin: pin.clone(),
        has_pin: !pin.is_empty(),
    }
}

/// Localiza o `dist/` do frontend para servir a página `#/remote` no
/// celular. Procura no dir de recursos do bundle (produção) e em layouts
/// de desenvolvimento (`src-tauri/../dist`, cwd). Retorna `None` quando
/// não encontra (a API continua funcionando; só a página cai).
fn resolve_dist_dir(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("dist"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("dist"));
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join("dist"));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().skip(1).take(4) {
            candidates.push(ancestor.join("dist"));
        }
    }
    candidates
        .into_iter()
        .find(|d| d.join("index.html").is_file())
}

async fn start_server(shared: &RemoteShared, app: &AppHandle) -> Result<(), String> {
    if shared.running.read().await.is_some() {
        return Ok(());
    }
    // PIN preguiçoso: gerado no primeiro start.
    {
        let mut pin = shared.pin.write().await;
        if pin.is_empty() {
            *pin = generate_pin();
            info!("Novo PIN do controle remoto gerado (sem PIN salvo)");
        }
    }
    let port = *shared.port.read().await;
    let srv_state = ServerState {
        shared: shared.clone(),
        app: app.clone(),
        dist_dir: None,
    };
    let dist_dir = resolve_dist_dir(app);
    match &dist_dir {
        Some(dir) => info!("Página remota servida de {}", dir.display()),
        None => warn!("dist/ não encontrado — a página #/remote fica indisponível (API ok)"),
    }
    let app_router = router(srv_state, dist_dir);
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        let err = format!("não foi possível escutar na porta {port}: {e}");
        error!("{err}");
        err
    })?;
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let handle = tauri::async_runtime::spawn(async move {
        info!("Servidor remoto iniciado na porta {port}");
        axum::serve(listener, app_router)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .ok();
    });
    *shared.running.write().await = Some(RunningServer {
        shutdown: shutdown_tx,
        handle,
    });
    Ok(())
}

async fn stop_server(shared: &RemoteShared) {
    if let Some(running) = shared.running.write().await.take() {
        info!("Parando servidor remoto...");
        let _ = running.shutdown.send(());
        running.handle.abort();
    }
}

async fn broadcast_state(shared: &RemoteShared) {
    let snapshot = shared.state.read().await;
    let msg = serde_json::json!({"type": "state", "state": &*snapshot}).to_string();
    let _ = shared.tx.send(msg);
}

// ── Comandos Tauri (chamados pelo frontend operador) ──

#[tauri::command]
pub async fn remote_get_status(shared: State<'_, RemoteShared>) -> Result<RemoteStatus, String> {
    Ok(status_of(&shared).await)
}

/// Liga o servidor. `port`/`pin` (vindos do `app_settings`) sobrescrevem
/// o cache quando informados; `None` mantém o valor atual.
#[tauri::command]
pub async fn remote_start(
    app: AppHandle,
    shared: State<'_, RemoteShared>,
    port: Option<u16>,
    pin: Option<String>,
) -> Result<RemoteStatus, String> {
    if let Some(p) = port {
        if p == 0 {
            return Err("porta inválida".to_string());
        }
        *shared.port.write().await = p;
    }
    if let Some(t) = pin {
        let t = t.trim().to_string();
        if !valid_pin(&t) {
            return Err("PIN deve ter 4 dígitos".to_string());
        }
        info!("PIN do controle remoto restaurado das configurações salvas");
        *shared.pin.write().await = t;
    }
    start_server(&shared, &app).await?;
    Ok(status_of(&shared).await)
}

#[tauri::command]
pub async fn remote_stop(shared: State<'_, RemoteShared>) -> Result<RemoteStatus, String> {
    stop_server(&shared).await;
    Ok(status_of(&shared).await)
}

/// Troca a porta; se o servidor estiver ligado, reinicia nela.
#[tauri::command]
pub async fn remote_set_port(
    app: AppHandle,
    shared: State<'_, RemoteShared>,
    port: u16,
) -> Result<RemoteStatus, String> {
    if port == 0 {
        return Err("porta inválida".to_string());
    }
    let was_running = shared.running.read().await.is_some();
    if was_running {
        stop_server(&shared).await;
    }
    *shared.port.write().await = port;
    if was_running {
        start_server(&shared, &app).await?;
    }
    Ok(status_of(&shared).await)
}

/// Gera novo PIN (celulares com o PIN antigo perdem acesso). Vale com servidor ligado.
#[tauri::command]
pub async fn remote_regen_pin(shared: State<'_, RemoteShared>) -> Result<RemoteStatus, String> {
    *shared.pin.write().await = generate_pin();
    Ok(status_of(&shared).await)
}

/// Espelho do operador → broadcast para os celulares.
#[tauri::command]
pub async fn remote_sync(
    shared: State<'_, RemoteShared>,
    payload: RemoteSyncPayload,
) -> Result<(), String> {
    // Valida se todas as raízes de mídia são diretórios válidos.
    for root in &payload.media_roots {
        match tokio::fs::metadata(root).await {
            Ok(meta) if meta.is_dir() => {}
            Ok(_) => {
                warn!("Raiz de mídia inválida (não é diretório): {root}");
                return Err(format!("o caminho {root} não é um diretório"));
            }
            Err(e) => {
                warn!("Erro ao acessar raiz de mídia {root}: {e}");
                return Err(format!("erro ao acessar {root}: {e}"));
            }
        }
    }

    let snapshot = RemoteStateSnapshot::from(payload.clone());
    *shared.state.write().await = snapshot;
    *shared.media_roots.write().await = payload.media_roots;
    broadcast_state(&shared).await;
    Ok(())
}
