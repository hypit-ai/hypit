import { defineConfig } from "vitepress";

const sharedTheme = {
  siteTitle: "NARRATAGE",
  socialLinks: [{ icon: "github" as const, link: "https://github.com/cashdiffusion/svml" }],
  search: { provider: "local" as const },
};

const enTheme = {
  ...sharedTheme,
  nav: [
    { text: "Quickstart", link: "/quickstart" },
    { text: "Develop", link: "/guide/develop" },
  ],
  sidebar: {
    "/quickstart": [
      { text: "Getting Started", items: [{ text: "Quickstart", link: "/quickstart" }] },
    ],
    "/guide/": [
      {
        text: "Develop",
        items: [
          { text: "Overview", link: "/guide/develop" },
          { text: "Package Architecture", link: "/guide/packages" },
          { text: "Adding an Author Package", link: "/guide/author-packages" },
          { text: "Adding a Provider", link: "/guide/providers" },
          { text: "Runtime Profile", link: "/guide/runtime-profile" },
          { text: "Local Services", link: "/guide/services" },
          { text: "Testing", link: "/guide/testing" },
          { text: "Conventions", link: "/guide/conventions" },
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
    { text: "开发指南", link: "/zh/guide/develop" },
  ],
  sidebar: {
    "/zh/quickstart": [
      { text: "开始使用", items: [{ text: "Quickstart", link: "/zh/quickstart" }] },
    ],
    "/zh/guide/": [
      {
        text: "开发指南",
        items: [
          { text: "概览", link: "/zh/guide/develop" },
          { text: "包架构", link: "/zh/guide/packages" },
          { text: "添加 Author 包", link: "/zh/guide/author-packages" },
          { text: "添加 Provider", link: "/zh/guide/providers" },
          { text: "Runtime Profile", link: "/zh/guide/runtime-profile" },
          { text: "本地服务", link: "/zh/guide/services" },
          { text: "测试", link: "/zh/guide/testing" },
          { text: "代码规范", link: "/zh/guide/conventions" },
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
  appearance: true,
  cleanUrls: true,
  // Engineering documents live in docs/ for the repository reader; only the
  // site pages (index, quickstart, guide, zh) are built into the public site.
  srcExclude: [
    "README.md",
    "architecture.md",
    "implementation-status.md",
    "roadmap.md",
    "open-source-distribution.md",
    "build-archive-and-egress.md",
    "caption-gemini-provider-contract.md",
    "graph-first-value-boundary.md",
    "image-transform.md",
    "kie-generation-modules.md",
    "local-developer-runtime.md",
    "media-execution-boundary.md",
    "media-inspection-and-normalization.md",
    "node-package-activation.md",
    "runtime-adapter-loading.md",
    "source-and-run-compilation.md",
  ],
  markdown: {
    theme: {
      light: "github-light",
      dark: "github-dark",
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
      `(function(){var p=location.pathname,b="/docs/",k="narratage-locale",h="narratage-hero-intro-seen",l;try{if(sessionStorage.getItem(h)==="1")document.documentElement.classList.add("hero-intro-seen");l=localStorage.getItem(k)}catch(e){}if(!l)l=(navigator.language||"").toLowerCase().indexOf("zh")===0?"zh":"en";if(p===b||p===b+"zh/"||p===b.slice(0,-1)||p===b+"zh")document.documentElement.classList.add("home-page");if(p===b&&l==="zh")location.replace(b+"zh/"+location.search+location.hash)})()`,
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
