import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_PROXY || "http://localhost:3001";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5174,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          // SSE поддержка: отключаем буферизацию прокси
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Accept", "text/event-stream, application/json");
            });
          },
        },
      },
    },
    build: {
      target: "es2022",
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            ui: ["framer-motion", "lucide-react"],
            forms: ["react-hook-form", "@hookform/resolvers", "zod"],
            i18n: ["i18next", "i18next-browser-languagedetector", "react-i18next"],
            md: ["marked", "dompurify"],
          },
        },
      },
    },
  };
});
