import { defineConfig } from "vitepress";

const noctisBordo = {
  name: "narratage-noctis-bordo",
  type: "dark" as const,
  colors: {
    "editor.background": "#322A2D",
    "editor.foreground": "#CBBEC2",
  },
  settings: [
    { settings: { background: "#322A2D", foreground: "#CBBEC2" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#715B63" } },
    { scope: ["string", "string.quoted", "punctuation.definition.string"], settings: { foreground: "#49E9A6" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier"], settings: { foreground: "#E66533" } },
    { scope: ["entity.name.tag", "punctuation.definition.tag", "meta.tag punctuation"], settings: { foreground: "#E66533" } },
    { scope: ["entity.other.attribute-name", "support.type.property-name", "variable.other.property"], settings: { foreground: "#D5971A" } },
    { scope: ["constant", "constant.numeric", "constant.language", "constant.character"], settings: { foreground: "#E4B781" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#49D6E9" } },
    { scope: ["entity.name.type", "entity.name.class", "support.class", "support.type"], settings: { foreground: "#7060EB" } },
    { scope: ["variable", "identifier"], settings: { foreground: "#CBBEC2" } },
    { scope: ["invalid", "invalid.illegal"], settings: { foreground: "#FFB3CD" } },
  ],
};

const sharedTheme = {
  siteTitle: "NARRATAGE",
  socialLinks: [{ icon: "github" as const, link: "https://github.com/cashdiffusion/svml" }],
  search: { provider: "local" as const },
};

const enTheme = {
  ...sharedTheme,
  nav: [
    { text: "Quickstart", link: "/quickstart" },
    { text: "Develop", link: "/guide/components" },
  ],
  sidebar: {
    "/quickstart": [
      { text: "Getting Started", items: [{ text: "Quickstart", link: "/quickstart" }] },
    ],
    "/guide/": [
      {
        text: "Develop",
        items: [
          { text: "Components", link: "/guide/components" },
          { text: "Runtime & Providers", link: "/guide/runtime" },
        ],
      },
    ],
  },
  outline: { level: [2, 3] as [number, number], label: "On this page" },
  docFooter: { prev: "Previous", next: "Next" },
};

const zhTheme = {
  ...sharedTheme,
  nav: [
    { text: "快速开始", link: "/zh/quickstart" },
    { text: "开发指南", link: "/zh/guide/components" },
  ],
  sidebar: {
    "/zh/quickstart": [
      { text: "开始使用", items: [{ text: "Quickstart", link: "/zh/quickstart" }] },
    ],
    "/zh/guide/": [
      {
        text: "开发指南",
        items: [
          { text: "创建组件", link: "/zh/guide/components" },
          { text: "运行时与 Provider", link: "/zh/guide/runtime" },
        ],
      },
    ],
  },
  outline: { level: [2, 3] as [number, number], label: "本页目录" },
  docFooter: { prev: "上一页", next: "下一页" },
};

export default defineConfig({
  base: "/docs/",
  lang: "en-US",
  title: "Narratage",
  description: "Write the story. Compile the video.",
  appearance: false,
  cleanUrls: true,
  markdown: {
    theme: {
      light: noctisBordo,
      dark: noctisBordo,
    },
    languageAlias: {
      svml: "xml",
      svk: "xml",
      svs: "xml",
      svc: "xml",
    },
  },
  head: [
    ["meta", { name: "theme-color", content: "#2C2126" }],
    [
      "script",
      {},
      `(function(){var p=location.pathname,b="/docs/",k="narratage-locale",h="narratage-hero-intro-seen",l;try{if(sessionStorage.getItem(h)==="1")document.documentElement.classList.add("hero-intro-seen");l=localStorage.getItem(k)}catch(e){}if(!l)l=(navigator.language||"").toLowerCase().indexOf("zh")===0?"zh":"en";if(p===b&&l==="zh")location.replace(b+"zh/"+location.search+location.hash)})()`,
    ],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cutive+Mono&family=Google+Sans+Code:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&display=swap",
      },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,0,0",
      },
    ],
  ],
  locales: {
    root: { label: "English", lang: "en-US", themeConfig: enTheme },
    zh: { label: "简体中文", lang: "zh-CN", link: "/zh/", themeConfig: zhTheme },
  },
  themeConfig: enTheme,
});
