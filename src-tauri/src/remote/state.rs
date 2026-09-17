//! DTOs espelhados com o frontend (`src/features/remote/types.ts`).
//!
//! O operador é a fonte da verdade: ele empurra snapshots via
//! `remote_sync`. O Rust apenas guarda, valida mídia e faz broadcast
//! para os celulares (sem isolamento por cliente).

use serde::{Deserialize, Serialize};

/// Item selecionável espelhado do operador.
/// Para mídia (`image`/`video`), `id` é o caminho absoluto no disco
/// (igual ao `ProjectableItem.id` do frontend).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RemoteItemDto {
    pub id: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(rename = "ref", default, skip_serializing_if = "Option::is_none")]
    pub ref_field: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// Miniatura (dataURL JPEG) gerada no operador — usada p/ vídeo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumb: Option<String>,
    /// true quando há arquivo servível em `/media`.
    #[serde(default)]
    pub has_media: bool,
}

/// Snapshot completo do operador.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RemoteStateSnapshot {
    #[serde(default)]
    pub module: String,
    #[serde(default)]
    pub items: Vec<RemoteItemDto>,
    #[serde(default)]
    pub selected_index: usize,
    #[serde(default)]
    pub live: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub projected: Option<serde_json::Value>,
}

/// Payload do `remote_sync` vindo do operador.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RemoteSyncPayload {
    #[serde(default)]
    pub module: String,
    #[serde(default)]
    pub items: Vec<RemoteItemDto>,
    #[serde(default)]
    pub selected_index: usize,
    #[serde(default)]
    pub live: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub projected: Option<serde_json::Value>,
    /// Pastas de fotos/vídeos configuradas — raízes permitidas p/ `/media`.
    #[serde(default)]
    pub media_roots: Vec<String>,
}

impl From<RemoteSyncPayload> for RemoteStateSnapshot {
    fn from(p: RemoteSyncPayload) -> Self {
        let selected_index = if p.items.is_empty() {
            0
        } else {
            p.selected_index.min(p.items.len() - 1)
        };
        Self {
            module: p.module,
            items: p.items,
            selected_index,
            live: p.live,
            projected: p.projected,
        }
    }
}

/// Ação vinda do celular (WS ou POST /api/action).
/// Repassada ao operador via evento Tauri `proge:remote-action`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemoteAction {
    #[serde(rename = "type")]
    pub action_type: String,
    #[serde(default)]
    pub index: Option<usize>,
    #[serde(default)]
    pub module: Option<String>,
}

impl RemoteAction {
    /// Validação leve antes de repassar ao operador.
    pub fn validate(&self) -> Result<(), String> {
        match self.action_type.as_str() {
            "select" => match self.index {
                Some(_) => Ok(()),
                None => Err("ação select exige index".to_string()),
            },
            "next" | "prev" | "project" | "clear" => Ok(()),
            "module" => match self.module.as_deref() {
                Some("biblia") | Some("letras") | Some("fotos") | Some("videos") => Ok(()),
                _ => Err("módulo inválido (biblia|letras|fotos|videos)".to_string()),
            },
            other => Err(format!("ação desconhecida: {other}")),
        }
    }
}
