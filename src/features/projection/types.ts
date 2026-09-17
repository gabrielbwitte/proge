export type ModuleId =
  | "biblia"
  | "letras"
  | "fotos"
  | "videos"
  | "web"
  | "fundo"
  | "configuracao";

export type ProjectionKind = "text" | "image" | "video" | "web" | "blank";

export interface StageTheme {
  background: string;
  foreground: string;
  fontSize: number;
  backgroundImage?: string;
}

export type FundoCategory = "padrao" | "biblia" | "letra";

export type FundoWallpapers = Partial<Record<FundoCategory, string>>;

export interface VideoOpts {
  loop: boolean;
  muted: boolean;
}

export interface ProjectPayload {
  kind: ProjectionKind;
  title: string;
  body: string;
  ref?: string;
  mediaUrl?: string;
  theme?: StageTheme;
  videoOpts?: VideoOpts;
  category?: FundoCategory;
}

/** Item selecionável na lista do módulo ativo do operador. */
export interface ProjectableItem {
  id: string;
  kind: Exclude<ProjectionKind, "blank">;
  title: string;
  body: string;
  ref?: string;
  mediaUrl?: string;
  videoOpts?: VideoOpts;
  category?: FundoCategory;
}

export const DEFAULT_STAGE_THEME: StageTheme = {
  background: "#000000",
  foreground: "#ffffff",
  fontSize: 64,
};
