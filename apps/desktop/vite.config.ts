import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Cấu hình theo khuyến nghị của Tauri 2: cổng cố định, không xoá màn hình log của Rust.
const host = process.env.TAURI_DEV_HOST;

// Phiên bản hiển thị trong "Giới thiệu": lấy từ tauri.conf.json (CI đặt 0.1.<số lần chạy>) và mã commit.
const appVersion = (JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8")) as { version: string }).version;
const appCommit = (process.env.GITHUB_SHA ?? "").slice(0, 7);

export default defineConfig({
  plugins: [
    react(),
    {
      // splash.html là trang tĩnh nên không dùng được import.meta.env; thay thẳng số phiên bản vào HTML.
      name: "nexfem-html-vars",
      transformIndexHtml: (html: string) => html.replaceAll("%APP_VERSION%", appVersion).replaceAll("%APP_COMMIT%", appCommit),
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(appVersion), __APP_COMMIT__: JSON.stringify(appCommit) },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2022",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), splash: fileURLToPath(new URL("./splash.html", import.meta.url)) } },
  },
});
