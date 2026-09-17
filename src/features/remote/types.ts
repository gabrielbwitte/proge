import type { ModuleId } from "../projection/types";

/** Espelho de `src-tauri/src/remote/state.rs`. Manter sincronizado. */

export interface RemoteItemDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  ref?: string;
  category?: string;
  /** Miniatura (dataURL JPEG) gerada no operador — usada p/ vídeo. */
  thumb?: string;
  /** true quando há arquivo servível em `/media`. */
  has_media: boolean;
}

export interface RemoteStateSnapshot {
  module: string;
  items: RemoteItemDto[];
  selected_index: number;
  live: boolean;
  projected?: unknown;
}

export interface RemoteSyncPayload extends RemoteStateSnapshot {
  /** Pastas de fotos/vídeos — raízes permitidas p/ `/media`. */
  media_roots: string[];
}

export type RemoteActionType =
  | "select"
  | "next"
  | "prev"
  | "project"
  | "clear"
  | "module";

export interface RemoteAction {
  type: RemoteActionType;
  index?: number;
  module?: ModuleId;
}

export interface RemoteStatus {
  running: boolean;
  ip: string;
  port: number;
  url: string;
  pin: string;
  has_pin: boolean;
}

/** Evento Tauri operador <- celular (emitido pelo Rust). */
export const REMOTE_ACTION_EVENT = "proge:remote-action";

/** Chaves em `app_settings` (persistência de porta/PIN). */
export const REMOTE_PORT_KEY = "remote.port";
export const REMOTE_PIN_KEY = "remote.pin";

export const REMOTE_DEFAULT_PORT = 8080;
