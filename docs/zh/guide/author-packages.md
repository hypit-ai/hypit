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
  "name": "@hypit/my-component",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "hypit": {
    "activation": "./src/activation.ts"
  },
  "dependencies": {
    "@hypit/protocol": "workspace:*",
    "@hypit/elaborator": "workspace:*",
    "@hypit/markup": "workspace:*"
  }
}
```

只添加你的包实际导入的依赖。分层规则参见 [包架构](./packages.md)。

## 3. 定义 Module Manifest

在 `src/index.ts` 中声明你的 Module 的身份、Type 和 Producer：

```typescript
import type { ModuleManifest, ModuleRef } from "@hypit/protocol";

export const myComponentModuleRef: ModuleRef = {
  name: "@hypit/my-component",
  version: "1",
};

export const myComponentManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: myComponentModuleRef.name,
  version: myComponentModuleRef.version,
  dependencies: [],
  types: [ /* your nominal Types */ ],
  capabilities: [],
  producers: [ /* your deterministic Producers */ ],
};

export const myComponentMarkupSurfaces = [{
  name: "widget",
  tag: "Widget",
  mode: "structured",
  outputs: [ /* 这段语法可以创作的 Type */ ],
  implementation: { digest: "sha256:..." },
}] as const;
```

Type 在名义上归属于 Module。Core 并不维护一个包含所有领域类型的中央联合类型 —— 安装一个新包就能添加新的 Type，无需发布新的 Core 版本。

## 4. 实现 Surface handler

Surface handler 把 Markup Frontend 的 XML 元素解码成带类型的作者声明。

```typescript
// src/surface.ts
import type { StructuredSurfaceHandler } from "@hypit/markup";

export const decodeMyComponentSurface: StructuredSurfaceHandler = ({ element }) => {
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
import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  myComponentManifest,
  myComponentMarkupSurfaces,
  myComponentModuleRef,
  decodeMyComponentSurface,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{
    manifest: myComponentManifest,
  }],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: myComponentModuleRef,
      declaration: myComponentMarkupSurfaces[0],
      handler: decodeMyComponentSurface,
    }),
  ],
};

export default hypitPackage;
```

Module 会自动提供精确的 `manifest.name@manifest.version`，所以作者直接导入
`@hypit/my-component@1`，无需再声明一份重复别名。只有包确实拥有另一个逻辑名称时
才使用可选的 `specifiers`。Surface declaration 决定可接受的标签（以 `mine` 导入时即为
`<mine:Widget>`）。它属于 Markup Host facet，不属于语义 Module Manifest，更不属于 Core。

## 6. 声明包依赖

```json
"dependencies": {
  "@hypit/protocol": "workspace:*"
}
```

pnpm 工作区链接负责解析包，不需要根路径注册表。

## 7. 安装

```bash
pnpm install --frozen-lockfile
```

包管理器负责安装、版本与完整性。Author 或 Run Source 导入逻辑能力时，Hypit 才会加载
对应包；Manifest 声明的精确 Module 依赖从该包的已安装依赖中加载。

## 8. 在 Author Source 中使用

```xml
<?svml using="@hypit/markup@1"?>
<svml>
  <import as="mine" from="@hypit/my-component@1"/>

  <mine:Widget id="demo" during={story.selection.example}/>
</svml>
```

`<import>` 只会 activate 作者词汇。它绝不授予网络、文件系统或凭据权限。

## 可供研究的现有示例

| 包 | 它展示了什么 |
|---|---|
| `packages/seedance/` | 带多个 Surface（Prompt、Speech、Video）的模型族 |
| `packages/seedance-speaker/` | 组合 Script、Text Template 和 Seedance 的更高层绑定 |
| `packages/caption/` | 公共 Program、Cue/字段合同和整 Atom 定时 |
| `packages/caption-fine/` | 一种无字段的 Style 与 Track Surface 样式族 |
| `packages/media-track/` | 带 Item/Sequence、图层、动效和交接行为的 Track |
| `packages/typography-track/` | Typography 叠加 Track |
| `packages/film/` | 消费同级 Track 的合成 target |
