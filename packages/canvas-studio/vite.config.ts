import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./src/browser/", import.meta.url)),
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("./dist/browser/", import.meta.url)),
    emptyOutDir: true,
  },
});
