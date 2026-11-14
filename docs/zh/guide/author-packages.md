---
title: 添加项目组件
description: 制作 NLE 组件、将其用于视频，并在有需要时分享。
---

创建组件是制作视频的一部分。从场景需要的行为出发：哪些内容共同出现，哪些内容会变化，由哪些参数或局部事件驱动。普通媒体保持为直接 NLE Item；共享视觉行为可以属于一个项目组件。

## 从完整的包开始

安装的 `@hypit/hypit` Distribution 包含 [`examples/semantic-composition/packages/audiovisual-title-card`](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/audiovisual-title-card)。将该目录复制到视频项目的 `packages/`，把包名与逻辑组件 Module 改为自己的 scope 和名称，并将示例中的 `workspace:*` 依赖改成项目选择的 Hypit 发行版本。

在复制后的包目录执行：

```bash
npm install --save-dev @hypit/hypit@<selected-release>
npm run build
```

示例提供 TypeScript 配置、`ProgramSource`、独立 HTML 实现、扁平 NLE resolver 与可选的包自有参数编辑。[包的 README](https://github.com/hypit-ai/hypit/blob/main/examples/semantic-composition/packages/audiovisual-title-card/README.md) 介绍准确边界。项目可以用普通包管理器的 workspace 或本地包依赖安装组件。

## 给组件有用的接口

公开另一个视频作者真正会改的决定：内容、素材与外观。父 NLE 拥有直接精确的 placement、trim、绘制顺序与 undo；包参数拥有组件内部共享行为。包需要动画时，可以在自己的参数中使用精确局部时间。只有预览或导出时，resolver 才把已安装的包实例变成普通 AVIR `ProgramSource`、Picture Operator 或 Audio Operator。

已有表演素材通常保持为普通 Media Item；只有真正共同变化的行为才进入组件。字幕或语义时间可以保持 source-local data，再由显式 materializer 一次性 bake；组件不需要全局 Timeline 对象。

Style 一类声明在裸作者 id 下公开其值，例如 `style={board-style}`；独立输出可以使用 `.visual`、`.audio`、`.track` 等有意义的后缀。在组件自己的 vocabulary 和 README 中说明名称与可用值。

## 实现并查看场景

所选发行版使用哪些 TypeScript API，以示例包 README 为准。[组件结构](./component-anatomy.md) 介绍如何设计组件公开给作者的选择。项目文案与素材作为输入，组件自己的面板、边框与装饰由实现绘制。

preview Source 为作者提供可打开或渲染的小例子。查看能说明行为的状态：进入、关键变化、停留布局和退出。也要在实际编排中查看，这时内容、空间和时机才有具体用途。

## 使用与分享

先在视频项目中安装这个包，再创建一个普通 NLE Component Present，用包的逻辑 Module 和组件名指向它：

```json
{
  "kind": "present",
  "source": "component",
  "component": {
    "module": { "name": "@your-scope/my-component" },
    "name": "title-card"
  },
  "parameters": { "title": "Opening" }
}
```

Agent、CLI 命令或编辑器都可以创建这个 Item，但持久工程只保存直接 placement 和参数。组件 README 应说明组件 symbol、参数、实用创作选择和行为示意图。

组件服务于当前作品时，就与项目一起保存。需要分享时，选择发布版本，编译并用 `npm pack` 打包代码和素材，或通过所有者自己的 scope 发布到 npm 或私有 Registry。发布到 Registry 时去掉 `private: true`，补充普通包元信息。使用者安装选定版本并提交包管理器 lockfile。使用组件不需要 Hypit 仓库 checkout，也不需要向主仓库提 PR。

## 阅读一个完整作品

历史的[复杂口播示例](https://github.com/hypit-ai/hypit/tree/main/examples/complex-explainer) 将主持人变场、独立字幕、网页演示和多个协同动效场景组合成完整作品。项目说明把每种修改指向负责它的 Source、Recipe 或组件包。它区分了三件事：划分组件职责、开放有用参数、为真实需求设计复用。

可以直接[观看最终成片](https://storage.googleapis.com/hypit-public-assets/assets/examples/complex-explainer/v1/20260914/final.mp4)。它是作品参考，不是当前包 API 的起步模板。
