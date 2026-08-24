---
title: Studio 当前架构边界
description: Studio 的启动单元、四区职责、作者写回、时间谱系与包边界。
---

# Studio 当前架构边界

> 本文只记录当前实现和稳定职责。领域组件、独立 Hypit Studio Companion 与 Studio 应用的三层边界，见 [Studio Companion Adapter 架构](./studio-companion-adapter-architecture.md)。右上 Inspector 与数据依赖可见性的下一阶段问题，见 [Studio Workspace 与 Inspector 信息架构审计](./studio-workspace-inspector-audit.md)；空间、字幕、时间消费和参数可达性所依赖的视频领域基础，见 [视频领域协议迁移与基建审计](./video-protocol-foundation-audit.md)。审计文档不是实施规格。

## 启动单元是 Run

Studio 打开一份明确的 `.svrun`，而不是单独打开 `.svml`：

```text
hypit-studio --run <project>/build.svrun
              [--workspace <project>]
              [--runtime <project>/hypit.runtime.json]
```

Run 决定读取哪份 Author Source、选择哪些 Candidate，以及哪些已接受 Build Record 被复用。Studio preflight 要求 Film/Render 目标及其显示闭包都能从已满足 Candidate 或确定性 Producer 得到。打开 Studio 不调用 Provider、不创建 Build，也不为未解决的 Need 猜测素材或放置占位。

未显式传 `--runtime` 时，Studio 与 CLI 一样从 Run 所在位置向上寻找最近的 `.hypit/runtime` 选择；该选择所在目录同时成为默认环境边界。未选择 Runtime 时 Source 与 Preview 仍可使用，Tasks 与 Artifacts 明确显示不可用，不猜测其他目录。

## 当前四区

### 左上：Source / Tasks / Artifacts

左上不是项目文件管理器，只显示三类有权威来源的内容：

- Source：当前 Run、Author 与编译闭包中真实引用的 SVML/SVS；每个文件都可切换查看，并只写回被选中的精确 Source；
- Tasks：当前环境的 Runtime Build Catalog、Build State、Dispatch 与 Operation 的只读投影；
- Artifacts：上述 Build 中 accepted Record 真实引用的 ArtifactStore 对象，不扫描输出目录。

Studio 不推断 campaign、方向或 variant 文件夹，不维护项目清单、历史摘要、运行锁或第二份数据库。任务和产物视图不会创建、取消、重试或恢复 Build。

### 中上：Preview

Preview 使用当前 Run 的真实素材和同一套领域程序生成 HyperFrames 画面。它负责播放、seek、缩放和画面选择，不从最终像素反推作者语义。

### 右上：Inspector

未选择实体时，Inspector 集中显示 Canvas、Author、Run、Source closure 与 Build intent。选择时间线实体后，只显示实体身份、时间谱系、来源和 Companion 明确公开的作者参数，不再重复整份 Run/Target 元信息。大类、可选子页和参数顺序由 Companion 的 Recipe allowlist 声明；领域组件 Manifest 不承担 Studio 页面语义。

### 下方：Timeline

时间线显示 Semantic Segment、Word、Selection、Moment，以及 Companion 从真实 Track 投影出的媒体、音频、文字、字幕和组件实体。lane、附属关系、family、有限 chrome、标题与有序内容层由 Companion 声明；时间文本、选择、播放、缩放、吸附、滚动和统一渲染由 Studio 负责。作者对象与投影/渲染对象身份不同时由公共 `subjectId` 明示，Studio 不拆 renderer id。Companion 只传 Artifact digest 或 Surface 身份，不知道 Studio 的 HTTP 路由。

## 作者写回

Studio 对结构化编辑只公开两类作者操作：

- `timeline.adjust`：沿实体真实时间谱系调整共享 Selection/Moment Anchor 或显式 Window 端点；
- `parameter.adjust`：修改 adapter 明确公开且带精确 Source range 的 SVML/SVS 参数。

左上源码编辑器可以替换当前真实闭包中选中的 SVRun、SVML 或 SVS 全文。组件 Inspector 不修改 SVRun Candidate 或 Provider 事实，也不把引用偷偷替换成匿名字面量。

每次结构化操作都携带当前 Snapshot revision。服务端重新解析操作目标、生成最小 Source 修改，再用同一 Run 重新编译预览；成功才发布新 Snapshot，失败则恢复 Source。完整边界见 [Studio 作者操作](./studio-timeline-operations.md)。

## 时间谱系

Studio 保留三层不同事实：

```text
作者选择（Program / Selection / Segment / Moment）
  -> 投影（TemporalPoint / TemporalWindow）
  -> 组件消费与最终 Track 实体
```

谱系来自本次 Run 实际执行闭包中的 Record、Spec 和消费者边，不根据属性名、运行时 id、renderer id 或相同帧区间猜测。缺失的链路保持 unresolved。详见 [Studio 时间谱系](./studio-temporal-windows.md)。

## 包边界

以下列表描述当前代码，并不取代 [Companion Adapter 架构](./studio-companion-adapter-architecture.md)：

- `packages/studio`：会话、preflight、snapshot、统一 UI、操作事务和 Source transport；
- `packages/studio-adapter`：官方和第三方 Companion 使用的稳定数据 ABI；
- `packages/*-studio`：各官方领域分别拥有的 Track 匹配、实体投影、lane 与参数声明；
- 领域包：继续只发布运行语义和确定性值，不依赖 Studio。

Adapter 不能向应用注入任意 DOM、CSS 或前端状态。删除 Studio 后，Core、SVML、SVS、SVRun 和 Runtime 仍可独立工作。

## 尚未定案

当前明确仍需调研：

- 右上现有 Companion Recipe 声明怎样继续扩展为更完整的控件与操作能力；
- 怎样恢复 prompt、参考素材、Producer、Provider、Artifact 与 Track 之间的可读依赖关系；
- Runtime 历史怎样分页读取，避免长期积累后逐个读取全部 Build 状态，同时不新增中心 Project 数据库或拖慢 Build；
- Artifacts 的视频海报、详情与复用动作应如何惰性提供而不污染 Build truth。

这些问题统一记录在 [Workspace 与 Inspector 信息架构审计](./studio-workspace-inspector-audit.md)，在调研完成前不固化为 ABI 或存储格式。

字幕派生 Cue 的参数链、未写可选参数、嵌套 Media 作者对象及组件声明边界不只是 Inspector 布局问题。它们记录在
[视频领域协议迁移与基建审计](./video-protocol-foundation-audit.md)，需先明确领域作者事实，再决定 Studio ABI。
