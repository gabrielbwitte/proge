//! Servidor HTTP Axum do controle remoto (borda de rede LAN).
//!
//! Rotas:
//! - `GET /` → `dist/index.html` (página `#/remote` do celular)
//! - `GET /api/state` → snapshot atual (auth)
//! - `POST /api/action` → ação do celular → evento Tauri (auth)
//! - `GET /ws` → WebSocket bidirecional (auth)
//! - `GET /media?path=<id>` → arquivo de foto/vídeo com Range (auth)
//!
//! Auth: `?pin=` na query ou `Authorization: Bearer <pin>`.

use std::path::{Component, Path, PathBuf};

use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tower_http::{cors::CorsLayer, services::ServeDir};
use tracing::{debug, error, warn};

use super::{state::RemoteAction, RemoteShared, REMOTE_ACTION_EVENT};

#[derive(Clone)]
pub struct ServerState {
    pub shared: RemoteShared,
    pub app: AppHandle,
}

#[derive(Debug, Deserialize, Default)]
pub struct AuthQuery {
    #[serde(default)]
    pub pin: Option<String>,
}

fn bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

async fn current_pin(shared: &RemoteShared) -> String {
    shared.pin.read().await.clone()
}

fn pin_authorized(expected: &str, headers: &HeaderMap, query: &AuthQuery) -> bool {
    if expected.is_empty() {
        return false;
    }
    let got = query.pin.clone().or_else(|| bearer(headers));
    match got {
        Some(t) if t.len() == expected.len() => {
            // Comparação em tempo (quase) constante.
            let mut diff = 0u8;
            for (a, b) in t.bytes().zip(expected.bytes()) {
                diff |= a ^ b;
            }
            diff == 0
        }
        _ => false,
    }
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({"error": "PIN inválido"})),
    )
        .into_response()
}

fn handle_action(
    _shared: &RemoteShared,
    app: &AppHandle,
    action: RemoteAction,
) -> Result<(), String> {
    action.validate()?;
    app.emit(REMOTE_ACTION_EVENT, &action)
        .map_err(|e| format!("falha ao notificar operador: {e}"))?;
    Ok(())
}

async fn api_state(
    State(srv): State<ServerState>,
    headers: HeaderMap,
    query: Query<AuthQuery>,
) -> Response {
    let pin = current_pin(&srv.shared).await;
    if !pin_authorized(&pin, &headers, &query) {
        warn!("Acesso não autorizado a /api/state");
        return unauthorized();
    }
    let snapshot = srv.shared.state.read().await;
    Json(serde_json::json!({"state": &*snapshot})).into_response()
}

async fn api_action(
    State(srv): State<ServerState>,
    headers: HeaderMap,
    query: Query<AuthQuery>,
    Json(action): Json<RemoteAction>,
) -> Response {
    let pin = current_pin(&srv.shared).await;
    if !pin_authorized(&pin, &headers, &query) {
        warn!("Acesso não autorizado a /api/action");
        return unauthorized();
    }
    debug!("Processando ação: {:?}", action);
    match handle_action(&srv.shared, &srv.app, action) {
        Ok(()) => Json(serde_json::json!({"ok": true})).into_response(),
        Err(e) => {
            error!("Erro ao processar ação: {e}");
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e})),
            )
                .into_response()
        }
    }
}

async fn ws_handler(
    State(srv): State<ServerState>,
    headers: HeaderMap,
    query: Query<AuthQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let pin = current_pin(&srv.shared).await;
    if !pin_authorized(&pin, &headers, &query) {
        return unauthorized();
    }
    ws.on_upgrade(move |socket| ws_loop(srv, socket))
}

async fn ws_loop(srv: ServerState, mut socket: WebSocket) {
    // Estado atual imediatamente ao conectar (todos recebem o mesmo).
    let current = {
        let snapshot = srv.shared.state.read().await;
        serde_json::json!({"type": "state", "state": &*snapshot}).to_string()
    };
    if socket.send(Message::Text(current)).await.is_err() {
        return;
    }
    let mut rx = srv.shared.tx.subscribe();
    let mut heartbeat_interval = tokio::time::interval(std::time::Duration::from_secs(30));

    loop {
        tokio::select! {
            _ = heartbeat_interval.tick() => {
                if socket.send(Message::Ping(Vec::new())).await.is_err() {
                    debug!("Cliente WebSocket desconectado durante ping");
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<RemoteAction>(&text) {
                            Ok(action) => {
                                debug!("Ação recebida via WS: {:?}", action);
                                if let Err(e) = handle_action(&srv.shared, &srv.app, action) {
                                    let _ = socket.send(Message::Text(
                                        serde_json::json!({"type":"error","error": e}).to_string(),
                                    )).await;
                                }
                            }
                            Err(_) => {
                                let _ = socket.send(Message::Text(
                                    serde_json::json!({"type":"error","error":"mensagem inválida"}).to_string(),
                                )).await;
                            }
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {
                        debug!("Pong recebido");
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => {
                        error!("Erro no WebSocket: {e}");
                        break;
                    }
                    _ => {}
                }
            }
            msg = rx.recv() => {
                match msg {
                    Ok(text) => {
                        if socket.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        }
    }
}

/// Normaliza sem tocar o disco (corta `.`, resolve `..` lexicalmente).
fn normalize_lexical(path: &str) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in PathBuf::from(path).components() {
        match comp {
            Component::Prefix(p) => out.push(p.as_os_str()),
            Component::RootDir => out.push("/"),
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(c) => out.push(c),
        }
    }
    out
}

/// `true` se `candidate` está dentro de alguma raiz permitida.
fn under_roots(candidate: &Path, roots: &[String]) -> bool {
    roots.iter().any(|root| {
        let norm_root = normalize_lexical(root);
        candidate.starts_with(&norm_root)
    })
}

#[derive(Debug, Deserialize)]
struct MediaQuery {
    #[serde(default)]
    pin: Option<String>,
    path: String,
}

fn content_type(path: &std::path::Path) -> String {
    mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string()
}

/// Serve foto/vídeo com suporte a `Range` (seek no celular).
async fn media_handler(
    State(srv): State<ServerState>,
    headers: HeaderMap,
    Query(q): Query<MediaQuery>,
) -> Response {
    let auth = AuthQuery { pin: q.pin };
    let pin = current_pin(&srv.shared).await;
    if !pin_authorized(&pin, &headers, &auth) {
        return unauthorized();
    }
    let candidate = normalize_lexical(&q.path);
    let roots = srv.shared.media_roots.read().await;
    if !under_roots(&candidate, &roots) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "fora das pastas de mídia"})),
        )
            .into_response();
    }
    drop(roots);

    let mut file = match tokio::fs::File::open(&candidate).await {
        Ok(f) => f,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "arquivo não encontrado"})),
            )
                .into_response();
        }
    };
    let meta = match file.metadata().await {
        Ok(m) => m,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "arquivo não encontrado"})),
            )
                .into_response();
        }
    };
    if !meta.is_file() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "arquivo não encontrado"})),
        )
            .into_response();
    }
    let len = meta.len();
    let ctype = content_type(&candidate);

    // Range simples: `bytes=start-end` (sufixo e multi-range não suportados).
    if let Some(range_header) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some(range) = parse_range(range_header, len) {
            let (start, end) = range;
            let body_len = end - start + 1;
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
            let stream = tokio_util::io::ReaderStream::new(file.take(body_len));
            return Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, ctype)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, body_len.to_string())
                .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
                .body(Body::from_stream(stream))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    }

    let stream = tokio_util::io::ReaderStream::new(file);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, ctype)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, len.to_string())
        .body(Body::from_stream(stream))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn parse_range(header_value: &str, len: u64) -> Option<(u64, u64)> {
    let range = header_value.strip_prefix("bytes=")?;
    let (start_s, end_s) = range.split_once('-')?;
    if start_s.is_empty() {
        return None; // range sufixo não suportado
    }
    let start: u64 = start_s.parse().ok()?;
    let end: u64 = if end_s.is_empty() {
        len.saturating_sub(1)
    } else {
        end_s.parse().ok()?
    };
    if start >= len {
        return None;
    }
    let end = end.min(len.saturating_sub(1));
    if end < start {
        return None;
    }
    Some((start, end))
}

async fn page_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Interface do controle remoto indisponível nesta instalação.",
    )
        .into_response()
}

pub fn router(srv: ServerState, dist_dir: Option<std::path::PathBuf>) -> Router {
    let app_router = Router::new()
        .route("/api/state", get(api_state))
        .route("/api/action", axum::routing::post(api_action))
        .route("/ws", get(ws_handler))
        .route("/media", get(media_handler));
    let app_router = match dist_dir {
        Some(dir) => app_router.fallback_service(ServeDir::new(dir)),
        None => app_router.fallback(page_unavailable),
    };
    app_router
        .layer(CorsLayer::permissive())
        .with_state(srv)
}
