import { defineConfig } from "vitepress";

export default defineConfig({
  base: "/docs/",
  title: "Narratage",
  description: "Write the story. Compile the video.",
  appearance: "force-dark",
  cleanUrls: true,
  markdown: {
    languageAlias: {
      svml: "xml",
      svk: "xml",
      svs: "xml",
      svc: "xml",
    },
  },
  head: [
    ["meta", { name: "theme-color", content: "#0b0d10" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap",
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: "快速开始", link: "/quickstart" },
      { text: "开发指南", link: "/guide/components" },
    ],
    sidebar: {
      "/quickstart": [
        {
          text: "开始使用",
          items: [{ text: "Quickstart", link: "/quickstart" }],
        },
      ],
      "/guide/": [
        {
          text: "开发指南",
          items: [
            { text: "创建组件", link: "/guide/components" },
            { text: "运行时与 Provider", link: "/guide/runtime" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/cashdiffusion/svml" }],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "本页目录" },
    docFooter: { prev: "上一页", next: "下一页" },
  },
});
