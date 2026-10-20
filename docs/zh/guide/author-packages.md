---
title: 添加作者包
description: 制作项目组件、将其用于视频，并在有需要时分享。
---

创建组件是制作视频的一部分。从场景需要的行为出发：哪些内容共同出现，哪些内容会变化，由什么事件驱动。普通素材呈现可以使用 Visual Track；一个播放中的视频移到侧面、同时让出空间展示流程图，可以属于同一个项目组件，独立字幕继续分开。

## 从完整的包开始

安装的 `@hypit/hypit` Distribution 包含 [`examples/minimal-author-package/packages/example-component`](https://github.com/hypit-ai/hypit/tree/main/examples/minimal-author-package/packages/example-component)。将该目录复制到视频项目的 `packages/`，把包名与 Module 改为自己的 scope 和名称，将示例中的 `workspace:*` Hypit 开发依赖改成项目所用的 Distribution 版本。

在复制后的包目录执行：

```bash
npm install --save-dev @hypit/hypit@<selected-release>
npm run build
```

示例提供 TypeScript 构建配置、Manifest、Surface、Fragment、Producer、activation 和小型 preview Source。[包的 README](https://github.com/hypit-ai/hypit/blob/main/examples/minimal-author-package/packages/example-component/README.md) 介绍准确文件与设置。项目可以用普通包管理器的 workspace 或本地包依赖安装组件。

## 给组件有用的接口

公开另一个视频作者真正会改的决定：内容、素材、位置、外观和有意义的事件。组件使用绝对
Window 和 Instant 输入来表达场景何时存在、何时变化。Source 可以从 Narrative Projection
或直接 Timeline 声明取得这些具名值；组件在两种情况下使用同一接口。

呈现已有说话表演时，把规范化媒体、它的绝对 occurrence Window 和呈现所需的源时间关系作为
彼此独立的输入。其他视频输入使用相同媒体路径；Timeline 不保存 Clip 或素材位置。
[响应式讲解场景](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/responsive-explainer) 展示持续播放的视频如何在 HTML 场景里从全屏移到侧边竖屏。
[聊天示例](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/chat-scene) 展示同一个事件接口如何消费由直接声明或语义声明产生的 Instant。

Style 一类 Surface 在裸作者 id 下公开其值，例如 `style={board-style}`；独立输出可以使用 `.visual`、`.audio`、`.track` 等有意义的后缀。在组件自己的 vocabulary 和 README 中说明名称与可用值。

## 实现并查看场景

作者包按职责使用 `@hypit/hypit/author`、`producer`、`refinement` 与 `markup` 等窄公共子路径，消费的领域值使用对应所有者的公开子路径。[组件结构](./component-anatomy.md) 介绍 Manifest、Surface、Fragment 和 Producer 如何配合。项目文案与素材作为输入，组件自己的面板、边框与装饰由实现绘制。

preview Source 为作者提供可打开或渲染的小例子。查看能说明行为的状态：进入、关键变化、停留布局和退出。也要在实际编排中查看，这时内容、空间和时机才有具体用途。

需要更丰富的交互编辑时，可以添加 Studio Companion。[Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-companion/README.md) 介绍如何公开时间线 Item、属性和 Source 绑定。绘制代码和 Companion 是同一个包中分别提供的贡献。

## 使用与分享

在 Source 中导入已安装组件的逻辑 Module：

```svml
<import as="mine" from="@your-studio/my-component@1"/>
```

将它声明的元素与输出用于编排。`hypit vocabulary` 展示作者接口，`hypit check` 检查 Source 或 Run。组件 README 应包含可复制示例、输出、实用的创作选择和行为示意图。

组件服务于当前作品时，就与项目一起保存。需要分享时，选择发布版本，编译并用 `npm pack` 打包代码和素材，或通过所有者自己的 scope 发布到 npm 或私有 Registry。发布到 Registry 时去掉 `private: true`，补充普通包元信息。使用者安装选定版本并提交包管理器 lockfile。使用组件不需要 Hypit 仓库 checkout，也不需要向主仓库提 PR。

## 阅读一个完整作品

[复杂口播示例](https://github.com/hypit-ai/hypit/tree/main/examples/complex-explainer) 将主持人变场、独立字幕、网页演示和多个协同动效场景组合成完整作品。项目说明把每种修改指向负责它的 Source、Recipe 或组件包。它区分了三件事：划分组件职责、开放有用参数、为真实需求设计复用。已接受素材单独提供，默认 Run 可以直接打开并渲染这份编排，无需重新请求生成。

可以直接[观看最终成片](https://storage.googleapis.com/hypit-public-assets/assets/examples/complex-explainer/v1/20260914/final.mp4)，也可以按照示例中的下载说明取得素材包，在 Studio 中打开完整作品。
