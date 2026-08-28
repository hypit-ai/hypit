import { defineConfig } from "vitepress";
import type { ShikiTransformer } from "shiki";

// Keep the server deployment at /docs/ while allowing the custom-domain
// GitHub Pages workflow to publish the same site at the domain root.
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
  siteTitle: "HYPIT",
  logo: {
    light: "/hypit-logo-dark.svg",
    dark: "/hypit-logo-light.svg",
    alt: "Hypit",
  },
  logoLink: "https://hypit.ai",
  socialLinks: [
    { icon: "github" as const, link: "https://github.com/hypit-ai/hypit" },
  ],
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
          { text: "Studio", link: "/quickstart/preview" },
          { text: "Run Source & Builds", link: "/quickstart/run" },
        ],
      },
    ],
    "/guide/": [
      {
        text: "Develop",
        items: [
          { text: "Overview", link: "/guide/develop" },
          { text: "Hypit Skill Architecture", link: "/guide/skill" },
          { text: "Package Architecture", link: "/guide/packages" },
          { text: "Adding an Author Package", link: "/guide/author-packages" },
          { text: "Component Anatomy", link: "/guide/component-anatomy" },
          { text: "Adding a Provider", link: "/guide/providers" },
          { text: "Runtime", link: "/guide/runtime" },
          { text: "Studio Companions", link: "/guide/studio-companion-architecture" },
          { text: "Studio Temporal Lineage", link: "/guide/studio-temporal-windows" },
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
          { text: "Studio", link: "/zh/quickstart/preview" },
          { text: "Run Source 与 Build", link: "/zh/quickstart/run" },
        ],
      },
    ],
    "/zh/guide/": [
      {
        text: "开发指南",
        items: [
          { text: "概览", link: "/zh/guide/develop" },
          { text: "Hypit Skill 架构", link: "/zh/guide/skill" },
          { text: "包架构", link: "/zh/guide/packages" },
          { text: "添加 Author 包", link: "/zh/guide/author-packages" },
          { text: "添加 Provider", link: "/zh/guide/providers" },
          { text: "Runtime", link: "/zh/guide/runtime" },
          { text: "Studio Companion", link: "/zh/guide/studio-companion-adapter-architecture" },
          { text: "Studio 时间谱系", link: "/zh/guide/studio-temporal-windows" },
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
  title: "Hypit",
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
    // Paints the selection tokens `svmlSelectionHighlighter` marks up inside every
    // SVML, SVS and SVRun code block. It is the one rule the stock theme needs.
    [
      "style",
      {},
      ".svml-selection{--shiki-light:#8250DF !important;--shiki-dark:#D2A8FF !important;font-weight:600}",
    ],
  ],
  vite: {
    plugins: [
      {
        name: "section-root-redirect",
        // The two section roots are static pages in public/, which the build copies
        // into the output and the deploy serves directly. The dev server routes the
        // same paths through VitePress, which has no page there, so it would answer
        // with its 404. Redirect them here to keep dev and the deploy in agreement.
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const path = request.url?.split("?")[0];
            const target =
              path === base ? `${base}quickstart` : path === `${base}zh/` ? `${base}zh/quickstart` : null;
            if (!target) return next();
            response.writeHead(302, { Location: target });
            response.end();
          });
        },
      },
    ],
  },
  locales: {
    root: { label: "English", lang: "en-US", themeConfig: enTheme },
    zh: { label: "简体中文", lang: "zh-CN", link: "/zh/", themeConfig: zhTheme },
  },
  themeConfig: enTheme,
});
