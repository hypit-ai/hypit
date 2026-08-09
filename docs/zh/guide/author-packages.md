---
title: 添加 Author 包
description: 添加新的作者层组件的分步指南。
---

# 添加 Author 包

作者包用一个新组件扩展视频词汇。作者在自己的 `.svml` 源码里通过 `<import>` 和 XML 元素来使用它。无需改动 Core、CLI 或任何聚合包。

## 1. 创建包

```bash
mkdir -p packages/my-component/src packages/my-component/test
```

## 2. 编写 package.json

```json
{
  "name": "@narratage/my-component",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "svml": {
    "activation": "./src/activation.ts"
  },
  "dependencies": {
    "@narratage/protocol": "workspace:*",
    "@narratage/elaborator": "workspace:*",
    "@narratage/text": "workspace:*"
  }
}
```

只添加你的包实际导入的依赖。分层规则参见[包架构](./packages.md)。

## 3. 定义 Module Manifest

在 `src/index.ts` 中声明你的 Module 的身份、Type 和 Producer：

```typescript
import type { ModuleManifest, ModuleRef } from "@narratage/protocol";

export const myComponentModuleRef: ModuleRef = {
  name: "@narratage/my-component",
  version: 1,
};

export const myComponentManifest: ModuleManifest = {
  module: myComponentModuleRef,
  types: [ /* your nominal Types */ ],
  producers: [ /* your deterministic Producers */ ],
};
```

Type 在名义上归属于 Module。Core 并不维护一个包含所有领域类型的中央联合类型 —— 安装一个新包就能添加新的 Type，无需发布新的 Core 版本。

## 4. 实现 Surface handler

Surface handler 把 Text Frontend 的 XML 元素解码成带类型的作者声明。

```typescript
// src/surface.ts
import type { TextSurfaceDecoder } from "@narratage/text";

export const decodeMyComponentSurface: TextSurfaceDecoder = (element, context) => {
  // Read attributes and children from the XML element
  // Validate inputs
  // Emit typed Records and Operations into context
  // Return authored graph declarations
};
```

可以参考已有的 Surface 实现：
- `packages/seedance/src/surface.ts` —— Prompt、Speech 和 Video Surface
- `packages/caption/src/surface.ts` —— 公共 Program Surface；具体 Style/Track Surface 属于各样式族包
- `packages/media-track/src/surface.ts` —— Track、Item 和 Sequence Surface

## 5. 编写 activation 描述符

```typescript
// src/activation.ts
import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  myComponentManifest,
  myComponentModuleRef,
  decodeMyComponentSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/my-component",
  modules: [{
    manifest: myComponentManifest,
    specifiers: ["@narratage/my-component", "@narratage/my-component@1"],
  }],
  hostFacets: [
    createTextSurfaceHostFacet({
      module: myComponentModuleRef,
      surface: "my-widget",
      mode: "structured",
      implementationDigest: "sha256:...",
      handler: decodeMyComponentSurface,
    }),
  ],
};

export default svmlPackage;
```

`specifiers` 数组列出了 `<import from="..."/>` 会去匹配的字符串。`surface` 字符串决定 XML 元素前缀（以 `mine` 导入时即为 `<mine:my-widget>`）。

## 6. 在 tsconfig.json 中注册

添加路径映射，让 TypeScript 把 `@narratage/my-component` 解析到源码：

```json
"@narratage/my-component": ["packages/my-component/src/index.ts"]
```

## 7. 安装并锁定

```bash
pnpm install

pnpm narratage lock-packages <lock-file> \
  --package @narratage/my-component \
  [--package @narratage/other-dep ...] \
  --root .
```

## 8. 在 Author Source 中使用

```xml
<?svml using="@narratage/text@1"?>
<svml>
  <import as="mine" from="@narratage/my-component@1"/>

  <mine:Widget id="demo" during={story.selection.example}/>
</svml>
```

`<import>` 只会 activate 作者词汇。它绝不授予网络、文件系统或凭据权限。

## 可供研究的现有示例

| 包 | 它展示了什么 |
|---|---|
| `packages/seedance/` | 带多个 Surface（Prompt、Speech、Video）的模型族 |
| `packages/seedance-speaker/` | 组合 Script、Prompt Kit 和 Seedance 的更高层绑定 |
| `packages/caption/` | 公共 Program、Cue/字段合同和整 Atom 定时 |
| `packages/caption-fine/` | 一种无字段的 Style 与 Track Surface 样式族 |
| `packages/media-track/` | 带 Item/Sequence、图层、动效和交接行为的 Track |
| `packages/text-track/` | 简单的文字叠加 Track |
| `packages/film/` | 消费同级 Track 的合成 target |
