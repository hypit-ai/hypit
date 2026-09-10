---
title: 添加作者包
description: 制作项目组件、将其用于视频，并在有需要时分享。
---

创建组件是制作视频的一部分。从场景需要的行为出发：哪些内容共同出现，哪些内容会变化，由什么事件驱动。普通素材呈现可以使用 Media Track；一个播放中的视频移到侧面、同时让出空间展示流程图，可以属于同一个项目组件，独立字幕继续分开。

## 从完整的包开始

安装的 `@hypit/hypit` Distribution 包含 [`examples/minimal-author-package/packages/example-component`](https://github.com/hypit-ai/hypit/tree/main/examples/minimal-author-package/packages/example-component)。将该目录复制到视频项目的 `packages/`，把包名与 Module 改为自己的 scope 和名称，将示例中的 `workspace:*` Hypit 开发依赖改成项目所用的 Distribution 版本。

在复制后的包目录执行：

```bash
npm install --save-dev @hypit/hypit@<selected-release>
npm run build
```

示例提供 TypeScript 构建配置、Manifest、Surface、Fragment、Producer、activation 和小型 preview Source。[包的 README](https://github.com/hypit-ai/hypit/blob/main/examples/minimal-author-package/packages/example-component/README.md) 介绍准确文件与设置。项目可以用普通包管理器的 workspace 或本地包依赖安装组件。

## 给组件有用的接口

公开另一个视频作者真正会改的决定：内容、素材、位置、外观和有意义的事件。转场可以接收一个 Moment，决定何时改变布局；接收一个 Selection，决定整个场景何时存在。纯动画则可以接收作者指定的事件时间。将这些输入投影到选定时钟，再按得到的调度绘制场景。

呈现已有说话表演时，消费它的 SemanticTrack，让画面采样与口播使用相同的 Take 和素材位置。其他视频输入以归一化媒体进入时间线。[响应式讲解场景](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/responsive-explainer) 展示持续播放的视频如何在 HTML 场景里从全屏移到侧边竖屏。[聊天示例](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/chat-scene) 展示同一个事件接口如何接受作者时间或 Script Moment。

Style 一类 Surface 在裸作者 id 下公开其值，例如 `style={board-style}`；独立输出可以使用 `.visual`、`.audio`、`.track` 等有意义的后缀。在组件自己的 vocabulary 和 README 中说明名称与可用值。

## 实现并查看场景

作者包 API 使用 `@hypit/hypit/author-kit`，消费的领域值使用对应公开子路径。[组件结构](./component-anatomy.md) 介绍 Manifest、Surface、Fragment 和 Producer 如何配合。项目文案与素材作为输入，组件自己的面板、边框与装饰由实现绘制。

preview Source 为作者提供可打开或渲染的小例子。查看能说明行为的状态：进入、关键变化、停留布局和退出。也要在实际编排中查看，这时内容、空间和时机才有具体用途。

需要更丰富的交互编辑时，可以添加 Studio Companion。[Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-adapter/README.md) 介绍如何公开时间线实体、属性和 Source 绑定。绘制代码和 Companion 是同一个包中分别提供的贡献。

## 使用与分享

在 Source 中导入已安装组件的逻辑 Module：

```svml
<import as="mine" from="@your-studio/my-component@1"/>
```

将它声明的元素与输出用于编排。`hypit vocabulary` 展示作者接口，`hypit check` 检查 Source 或 Run。组件 README 应包含可复制示例、输出、实用的创作选择和行为示意图。

组件服务于当前作品时，就与项目一起保存。需要分享时，选择发布版本，编译并用 `npm pack` 打包代码和素材，或通过所有者自己的 scope 发布到 npm 或私有 Registry。发布到 Registry 时去掉 `private: true`，补充普通包元信息。使用者安装选定版本并提交包管理器 lockfile。使用组件不需要 Hypit 仓库 checkout，也不需要向主仓库提 PR。
