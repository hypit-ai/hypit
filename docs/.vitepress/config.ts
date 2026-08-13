import { defineConfig } from "vitepress";
import type { ShikiTransformer } from "shiki";

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
          { text: "Caption, Media & Text", link: "/quickstart/tracks" },
          { text: "Film & Rendering", link: "/quickstart/composition" },
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
          { text: "Runtime Profile", link: "/guide/runtime-profile" },
          { text: "SVML Playground", link: "/guide/svml-playground" },
          { text: "Caption Playground", link: "/guide/caption-playground" },
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
      {
        text: "开始使用",
        items: [
          { text: "概览", link: "/zh/quickstart" },
          { text: "Script", link: "/zh/quickstart/script" },
          { text: "SVS 样式表", link: "/zh/quickstart/styles" },
          { text: "媒体与生成", link: "/zh/quickstart/generation" },
          { text: "时序与装配", link: "/zh/quickstart/timing" },
          { text: "字幕、Media 与文字", link: "/zh/quickstart/tracks" },
          { text: "Film 与渲染", link: "/zh/quickstart/composition" },
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
          { text: "Runtime Profile", link: "/zh/guide/runtime-profile" },
          { text: "SVML Playground", link: "/zh/guide/svml-playground" },
          { text: "字幕 Playground", link: "/zh/guide/caption-playground" },
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
  // Keep the server deployment at /docs/ while allowing the custom-domain
  // GitHub Pages workflow to publish the same site at the domain root.
  base: process.env.VITEPRESS_BASE || "/docs/",
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
