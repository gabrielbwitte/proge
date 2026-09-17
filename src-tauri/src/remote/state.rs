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
    /// Posição + catálogo da Bíblia (opaco p/ o Rust, espelhado do operador).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bible: Option<serde_json::Value>,
    /// Busca + seleção de letras (opaco p/ o Rust, espelhado do operador).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub letras: Option<serde_json::Value>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bible: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub letras: Option<serde_json::Value>,
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
            bible: p.bible,
            letras: p.letras,
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
    /// Navegação da Bíblia (`bible`): ao menos um presente.
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub book: Option<String>,
    #[serde(default)]
    pub chapter: Option<u32>,
    /// Seleção de música (`song`).
    #[serde(default)]
    pub song_id: Option<String>,
    /// Busca na biblioteca (`search`).
    #[serde(default)]
    pub search_query: Option<String>,
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
            "bible" => match (&self.version, &self.book, &self.chapter) {
                (None, None, None) => Err("ação bible exige version, book ou chapter".to_string()),
                (_, _, Some(0)) => Err("capítulo inválido".to_string()),
                _ => Ok(()),
            },
            "song" => match &self.song_id {
                Some(_) => Ok(()),
                None => Err("ação song exige song_id".to_string()),
            },
            "search" => match &self.search_query {
                Some(_) => Ok(()),
                None => Err("ação search exige search_query".to_string()),
            },
            other => Err(format!("ação desconhecida: {other}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base(action_type: &str) -> RemoteAction {
        RemoteAction {
            action_type: action_type.to_string(),
            index: None,
            module: None,
            version: None,
            book: None,
            chapter: None,
            song_id: None,
            search_query: None,
        }
    }

    #[test]
    fn select_exige_index() {
        assert!(base("select").validate().is_err());
        let mut a = base("select");
        a.index = Some(2);
        assert!(a.validate().is_ok());
    }

    #[test]
    fn acoes_simples_sempre_ok() {
        for t in ["next", "prev", "project", "clear"] {
            assert!(base(t).validate().is_ok(), "{t}");
        }
    }

    #[test]
    fn module_aceita_os_quatro_e_rejeita_resto() {
        for m in ["biblia", "letras", "fotos", "videos"] {
            let mut a = base("module");
            a.module = Some(m.to_string());
            assert!(a.validate().is_ok(), "{m}");
        }
        assert!(base("module").validate().is_err());
        let mut a = base("module");
        a.module = Some("configuracao".to_string());
        assert!(a.validate().is_err());
    }

    #[test]
    fn bible_exige_ao_menos_um_campo_e_capitulo_valido() {
        assert!(base("bible").validate().is_err());
        let mut zero = base("bible");
        zero.chapter = Some(0);
        assert!(zero.validate().is_err());
        let mut v = base("bible");
        v.version = Some("ra".to_string());
        assert!(v.validate().is_ok());
        let mut full = base("bible");
        full.version = Some("ra".to_string());
        full.book = Some("gn".to_string());
        full.chapter = Some(1);
        assert!(full.validate().is_ok());
    }

    #[test]
    fn song_e_search_exigem_campo() {
        assert!(base("song").validate().is_err());
        let mut s = base("song");
        s.song_id = Some("12".to_string());
        assert!(s.validate().is_ok());
        assert!(base("search").validate().is_err());
        let mut q = base("search");
        q.search_query = Some("amazing".to_string());
        assert!(q.validate().is_ok());
    }

    #[test]
    fn acao_desconhecida_erro() {
        assert!(base("dance").validate().is_err());
    }
}
