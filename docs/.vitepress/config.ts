import { defineConfig } from "vitepress";
import type { ShikiTransformer } from "shiki";

// Keep the server deployment at /docs/ while allowing the custom-domain
// GitHub Pages workflow to publish the same site at the domain root. The
// pre-paint script below has to agree with this, so both read the one value.
const base = process.env.VITEPRESS_BASE || "/docs/";

function svmlSelectionHighlighter(): ShikiTransformer {
  return {
    name: "svml-selection-highlighter",
    span(node) {
      const text = node.children?.[0];
      if (!text || text.type !== "text") return;
      const v = text.value;
      const re = /(~?@\/?[A-Za-z][\w-]*[!~]?| \| )/g;
      const parts: Array<{ value: string; highlight: boolean }> = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(v)) !== null) {
        if (m[1].startsWith("@")) {
          const after = v[re.lastIndex];
          if (after === "/") continue;
        }
        if (m.index > last) parts.push({ value: v.slice(last, m.index), highlight: false });
        parts.push({ value: m[1], highlight: true });
        last = re.lastIndex;
      }
      if (parts.length === 0) return;
      if (last < v.length) parts.push({ value: v.slice(last), highlight: false });
      node.children = parts.map((p) =>
        p.highlight
          ? { type: "element", tagName: "span", properties: { class: "svml-selection" }, children: [{ type: "text", value: p.value }] }
          : { type: "text", value: p.value },
      );
    },
  };
}

const svsLanguage: Record<string, unknown> = {
  name: "svs",
  scopeName: "source.svs",
  patterns: [
    { include: "#processing-instruction" },
    { include: "#close-tag" },
    { include: "#open-tag" },
    { include: "#comment" },
    { include: "#recipe-block" },
  ],
  repository: {
    "processing-instruction": {
      begin: "<\\?",
      end: "\\?>",
      beginCaptures: { "0": { name: "punctuation.definition.tag.xml" } },
      endCaptures: { "0": { name: "punctuation.definition.tag.xml" } },
      name: "meta.tag.preprocessor.xml",
      patterns: [
        { match: "\\bsvml\\b", name: "entity.name.tag.xml" },
        { include: "#attribute" },
      ],
    },
    "open-tag": {
      begin: "(<)(sheet)\\b",
      beginCaptures: {
        "1": { name: "punctuation.definition.tag.xml" },
        "2": { name: "entity.name.tag.xml" },
      },
      end: ">",
      endCaptures: { "0": { name: "punctuation.definition.tag.xml" } },
      patterns: [{ include: "#attribute" }],
    },
    "close-tag": {
      match: "(</)(sheet)(>)",
      captures: {
        "1": { name: "punctuation.definition.tag.xml" },
        "2": { name: "entity.name.tag.xml" },
        "3": { name: "punctuation.definition.tag.xml" },
      },
    },
    attribute: {
      match: '([\\w-]+)(=)("[^"]*")',
      captures: {
        "1": { name: "entity.other.attribute-name.xml" },
        "2": { name: "punctuation.separator.key-value.xml" },
        "3": { name: "string.quoted.double.xml" },
      },
    },
    comment: {
      name: "comment.block.css",
      begin: "/\\*",
      end: "\\*/",
    },
    "recipe-block": {
      begin: "([a-z][\\w-]*)(\\.)(\\S+)\\s*(\\{)",
      beginCaptures: {
        "1": { name: "entity.name.tag.css" },
        "2": { name: "punctuation.accessor.css" },
        "3": { name: "entity.other.attribute-name.class.css" },
        "4": { name: "punctuation.section.block.begin.css" },
      },
      end: "\\}",
      endCaptures: { "0": { name: "punctuation.section.block.end.css" } },
      patterns: [{ include: "#comment" }, { include: "#property-declaration" }],
    },
    "property-declaration": {
      begin: "([a-z][\\w-]*)\\s*(:)",
      beginCaptures: {
        "1": { name: "support.type.property-name.css" },
        "2": { name: "punctuation.separator.key-value.css" },
      },
      end: ";",
      endCaptures: { "0": { name: "punctuation.terminator.rule.css" } },
      patterns: [{ include: "#property-value" }],
    },
    "property-value": {
      patterns: [
        { match: "#[0-9A-Fa-f]{3,8}\\b", name: "constant.other.color.css" },
        { match: "\\b\\d+(?:\\.\\d+)?\\b", name: "constant.numeric.css" },
        { match: "\\./[^;\\s]+", name: "string.unquoted.css" },
        { match: "[a-zA-Z][\\w:-]+", name: "support.constant.property-value.css" },
      ],
    },
  },
};

const sharedTheme = {
  siteTitle: "NARRATAGE",
  socialLinks: [{ icon: "github" as const, link: "https://github.com/hypit-ai/narratage" }],
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
      {
        text: "Getting Started",
        items: [
          { text: "Overview", link: "/quickstart" },
          { text: "Script", link: "/quickstart/script" },
          { text: "SVS Stylesheets", link: "/quickstart/styles" },
          { text: "Media & Generation", link: "/quickstart/generation" },
          { text: "Timing & Assembly", link: "/quickstart/timing" },
          { text: "Tracks", link: "/quickstart/tracks" },
          { text: "Image Operations", link: "/quickstart/images" },
          { text: "Film & Rendering", link: "/quickstart/composition" },
          { text: "Live Preview", link: "/quickstart/preview" },
          { text: "Run Source & Builds", link: "/quickstart/run" },
        ],
      },
    ],
    "/guide/": [
      {
        text: "Develop",
        items: [
          { text: "Overview", link: "/guide/develop" },
          { text: "Package Architecture", link: "/guide/packages" },
          { text: "Adding an Author Package", link: "/guide/author-packages" },
          { text: "Adding a Provider", link: "/guide/providers" },
          { text: "Runtime", link: "/guide/runtime" },
          { text: "Caption Playground", link: "/guide/caption-playground" },
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
      {
        text: "开始使用",
        items: [
          { text: "概览", link: "/zh/quickstart" },
          { text: "Script", link: "/zh/quickstart/script" },
          { text: "SVS 样式表", link: "/zh/quickstart/styles" },
          { text: "媒体与生成", link: "/zh/quickstart/generation" },
          { text: "时序与装配", link: "/zh/quickstart/timing" },
          { text: "轨道", link: "/zh/quickstart/tracks" },
          { text: "图片操作", link: "/zh/quickstart/images" },
          { text: "Film 与渲染", link: "/zh/quickstart/composition" },
          { text: "实时预览", link: "/zh/quickstart/preview" },
          { text: "Run Source 与 Build", link: "/zh/quickstart/run" },
        ],
      },
    ],
    "/zh/guide/": [
      {
        text: "开发指南",
        items: [
          { text: "概览", link: "/zh/guide/develop" },
          { text: "包架构", link: "/zh/guide/packages" },
          { text: "添加 Author 包", link: "/zh/guide/author-packages" },
          { text: "添加 Provider", link: "/zh/guide/providers" },
          { text: "Runtime", link: "/zh/guide/runtime" },
          { text: "字幕 Playground", link: "/zh/guide/caption-playground" },
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
  base,
  lang: "en-US",
  title: "Narratage",
  description: "Write the story. Compile the video.",
  appearance: true,
  cleanUrls: true,
  markdown: {
    theme: {
      light: "github-light",
      dark: "github-dark",
    },
    languages: [svsLanguage as never],
    languageAlias: {
      svml: "xml",
      svk: "xml",
    },
    codeTransformers: [svmlSelectionHighlighter()],
  },
  head: [
    ["meta", { name: "theme-color", content: "#f3f0e8", media: "(prefers-color-scheme: light)" }],
    ["meta", { name: "theme-color", content: "#131211", media: "(prefers-color-scheme: dark)" }],
    // Runs before first paint: restores the "intro already seen" flag, marks the
    // home page so the branded palette paints without a flash, and sends
    // zh-preferring visitors to the Chinese home.
    [
      "script",
      {},
      `(function(){var p=location.pathname,b=${JSON.stringify(base)},k="narratage-locale",h="narratage-hero-intro-seen",d=document.documentElement,l;try{if(sessionStorage.getItem(h)==="1")d.classList.add("hero-intro-seen");l=localStorage.getItem(k)}catch(e){}if(!l)l=(navigator.language||"").toLowerCase().indexOf("zh")===0?"zh":"en";var en=p===b||(b.length>1&&p===b.slice(0,-1)),zh=p===b+"zh/"||p===b+"zh";if(en||zh)d.classList.add("home-page");if(en&&l==="zh")location.replace(b+"zh/"+location.search+location.hash)})()`,
    ],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    // The only webfont the site still needs: the demo players' audio toggle.
    // Everything else is the system monospace stack.
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
