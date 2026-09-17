import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = process.env.SURREEL_API_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.SURREEL_DEV_PORT ?? 8080),
    proxy: {
      "/api": {
        target: api,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: Number(process.env.SURREEL_DEV_PORT ?? 4173),
  },
});
