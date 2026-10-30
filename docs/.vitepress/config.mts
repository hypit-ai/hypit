import { defineConfig } from "vitepress";

export default defineConfig({
  markdown: {
    languageAlias: {
      svml: "xml",
      svs: "css",
    },
  },
});
