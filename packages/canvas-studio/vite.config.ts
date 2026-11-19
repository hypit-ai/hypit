import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL("./src/browser/", import.meta.url)),
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("./dist/browser/", import.meta.url)),
    emptyOutDir: true,
  },
});
