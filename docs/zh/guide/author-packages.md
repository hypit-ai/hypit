---
title: 添加 Author 包
description: 添加新的作者层组件的分步指南。
---

# 添加 Author 包

作者包用一个新组件扩展视频词汇。作者在自己的 `.svml` 源码里通过 `<import>` 和 XML 元素来使用它。无需改动 Core、CLI 或任何聚合包。

## Style-like Surface 的公开 id

如果 Surface 发布的是 Style-like 值，公开 Record 必须使用作者写下的裸 id（`${id}`），不能写成
`${id}.style` 或 `${id}.value`。Author Source 也使用裸 id，例如 `style={board-style}`；只有真正
独立的 Track 等输出才使用 `.track` 一类后缀。

## 1. 创建包

```bash
mkdir -p packages/my-component/src packages/my-component/test
```

在视频项目中创建它，并从一开始使用所有者自己的 scope；`@hypit/*` 由当前 Distribution 拥有。

## 2. 编写 package.json

```json
{
  "name": "@your-studio/my-component",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "files": ["dist", "preview", "README.md"],
  "exports": { ".": "./dist/index.js" },
  "hypit": {
    "activation": "./dist/activation.js"
  },
  "devDependencies": {
    "hypit": "^0.1.0",
    "typescript": "^5.9.0"
  }
}
```

开发时使用公开的 `hypit/*` subpath，发布物只包含组件自己的编译文件。分层规则参见
[包架构](./packages.md)。

## 3. 定义 Module Manifest

在 `src/index.ts` 中声明你的 Module 的身份、Type 和 Producer：

```typescript
import type { ModuleManifest, ModuleRef } from "hypit/author-kit";

export const myComponentModuleRef: ModuleRef = {
  name: "@your-studio/my-component",
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
  vocabulary: { /* 这个元素是什么、长什么样 —— 见第 5 步 */ },
}] as const;
```

Type 在名义上归属于 Module。Core 并不维护一个包含所有领域类型的中央联合类型 —— 安装一个新包就能添加新的 Type，无需发布新的 Core 版本。

## 4. 实现 Surface handler

Surface handler 把 Markup Frontend 的 XML 元素解码成带类型的作者声明。

```typescript
// src/surface.ts
import type { StructuredSurfaceHandler } from "hypit/author-kit";

export const decodeMyComponentSurface: StructuredSurfaceHandler = ({ element }) => {
  // Read attributes and children from the XML element
  // Validate inputs
  // Emit typed Records and Operations into context
  // Return authored graph declarations
};
```

通用包不要从业务包源码推断写法。使用仓库内的最小完整 fixture：
`examples/minimal-author-package/packages/example-component/`。它包含完整的
Surface 返回值、Fragment literal、Manifest ports、Producer 和 activation 形状。
只有 `hypit vocabulary` 已证明存在高度相似的结构性 sibling 时，才允许读取该
sibling 的 README 和实现所需的少数 role 文件，并将其复制为新的 Module；不得比较无关业务包。

## 5. 声明 Surface 词表与预览图

`vocabulary` 是这个元素自我说明的地方。创作者要读它，任何不去翻源码、只检视已安装包的工具也要读它。一个没有词表的 Surface 是合法的，同时也是不可见的：下一个碰到你这个元素的人，手上只有一个标签名。

```typescript
// src/manifest.ts
import { readFile } from "node:fs/promises";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

vocabulary: {
  summary: "一句话说明这个元素产出什么、被放在什么之上。",
  appearance: "观众实际看到的东西，包括它如何进入、如何保持、如何离开。",
  preview: previewImage("Widget.png"),
  attributes: [
    { name: "id", kind: "identifier", required: true, summary: "为这个 Widget 命名。" },
  ],
  children: [ /* 接受的子元素 */ ],
  ports: [ /* 声明的边 */ ],
  example: "<mine:Widget id=\"first\"/>",
  notes: [ /* 读者不看就只能靠报错发现的规则 */ ],
}
```

凡是读者应该在 Studio 时间轴或目录里一眼认出的 Surface，都要声明 `preview`：它是海报。海报是设计出来的图，不是产出的一帧。它用这一小块位置所允许的最抽象、最形象的方式说明组件是什么，就像电影海报不是电影截屏：`@hypit/ranking` 的 Column 海报是一列名次徽章挨着一列图标，Tier 榜是带字母的几行加图标。把它画成 SVG 随包提交，栅格化成 manifest 在 `preview/` 下指名的 PNG，组件外观演进时海报保持稳定。没有可展示产出的 Surface 可以不声明，例如只负责装配请求的那种。

`appearance` 和 `preview` 回答的是两个不同的问题，谁都替代不了谁：`appearance` 说的是这个元素在所有情况下都会画出什么，海报说的是这个元素是干什么的。

完整词表和预览声明以最小 fixture 为权威示例。`hypit vocabulary <package>` 打印已安装包的公开声明；从这份输出写作，而不是打开别的业务包源码。

## 6. 编写 activation 描述符

```typescript
// src/activation.ts
import { createMarkupSurfaceHostFacet } from "hypit/author-kit";
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

Module 会自动提供精确的 `manifest.name@manifest.version`，所以作者直接导入 `@your-studio/my-component@1`，无需再声明一份重复别名。只有包确实拥有另一个逻辑名称时才使用可选的 `specifiers`。Surface declaration 决定可接受的标签（以 `mine` 导入时即为 `<mine:Widget>`）。它属于 Markup Host facet，不属于语义 Module Manifest，更不属于 Core。

## 7. 编译包

```bash
pnpm build
```

框架声明从 `hypit/author-kit` 导入；组件使用的领域值从 `hypit/composition` 等所属
subpath 导入。加载 activation 时由当前 Distribution 提供这些 API，组件 tarball 不携带另一份 Hypit。

## 8. 安装

```bash
pnpm install --frozen-lockfile
```

包管理器负责安装、版本与完整性。Author 或 Run Source 导入逻辑能力时，Hypit 才会加载对应包；Manifest 声明的精确 Module 依赖从该包的已安装依赖中加载。

## 9. 在 Author Source 中使用

```xml
<?svml using="@hypit/markup@1"?>
<svml>
  <import as="mine" from="@your-studio/my-component@1"/>

  <mine:Widget id="demo" during={story.selection.example}/>
</svml>
```

`<import>` 只会 activate 作者词汇。它绝不授予网络、文件系统或凭据权限。

## 10. 保留或分享同一份包

创建这个包是正常的视频制作工作。只有当前视频需要它时，就把它作为私有包保存在项目的
`packages/` 中。所有者希望其他项目使用时，编译同一份包，再通过版本化的 `npm pack` tarball
直接交付，或发布到所有者自己的 npm scope 或私有 registry。使用方通过自己的包管理器安装选定
版本并提交 lockfile；只要逻辑接口保持兼容，Source 中的 Module import 就不需要变化。

公开发布时，移除 `private: true`，并补充普通的 npm 发现与归属信息：

```json
{
  "description": "A speech-timed score strip for Hypit videos.",
  "keywords": ["hypit", "hypit-author-package", "scoreboard"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/studio/score-strip.git"
  },
  "license": "MIT"
}
```

README 应包含可直接使用的 Source 示例、公开输出、组件的视觉证据，以及验证时采用的 Hypit
版本。安装后，`hypit vocabulary <package>` 会读取所选版本自己的 Surface 声明。包的发现、发布、
版本和完整性继续由 npm 或选定的私有 registry 负责；只有 Source 导入了某个逻辑能力时，Hypit
才加载对应包。

## 实现分流

没有高度相似 sibling 时，只读规范文档、已安装包的 vocabulary 输出和
`examples/minimal-author-package/packages/example-component/` fixture。

当 vocabulary 证明输入/输出 Type、timing contract、终端 Track 和 Surface ports 高度相似，
才可走 close-sibling 路径：读取该 sibling 的 README 与必要 role 文件，复制结构，重建
Module/Producer identity，并直接检查 Source 使用方式与 preview 结果。
