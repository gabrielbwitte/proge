import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { execSync } from "node:child_process";
import process from "node:process";
import tailwindcss from '@tailwindcss/vite'
import path from "path"
const host = process.env.TAURI_DEV_HOST;

/** Marcador de build p/ provar qual bundle o celular executa (`__PROGE_BUILD__`).
 * Inclui data/hora para distinguir rebuilds sem commit (o Axum serve `dist/`
 * estático e o navegador do celular pode cachear o `index.html`). */
function buildId(): string {
  let sha = "nogit";
  try {
    sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim() || sha;
  } catch {
    // fora de repo git: usa só a data
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  return `${sha}-${stamp}`;
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  define: {
    __PROGE_BUILD__: JSON.stringify(buildId()),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
