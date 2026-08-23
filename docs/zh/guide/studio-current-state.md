---
title: Studio 当前架构边界
description: Studio 的启动单元、四区职责、作者写回、时间谱系与包边界。
---

# Studio 当前架构边界

> 本文只记录当前实现和稳定职责。左上 Workspace、右上 Inspector、任务/产物浏览与数据依赖可见性的下一阶段问题，见 [Studio Workspace 与 Inspector 信息架构审计](./studio-workspace-inspector-audit.md)。那份审计不是实施规格。

## 启动单元是 Run

Studio 打开一份明确的 `.svrun`，而不是单独打开 `.svml`：

```text
hypit-studio --run <project>/build.svrun
              [--workspace <project>]
              [--runtime <project>/hypit.runtime.json]
```

Run 决定读取哪份 Author Source、选择哪些 Candidate，以及哪些已接受 Build Record 被复用。Studio preflight 要求 Film/Render 目标及其显示闭包都能从已满足 Candidate 或确定性 Producer 得到。打开 Studio 不调用 Provider、不创建 Build，也不为未解决的 Need 猜测素材或放置占位。

## 当前四区

### 左上：Source

当前显示一份真实 Author SVML，支持源码高亮、选择联动和完整文本编辑。服务端同时监视当前 Run 与编译 Source closure，但浏览器还没有用于切换相关 SVML、SVS 和 SVRun 的 Workspace。

### 中上：Preview

Preview 使用当前 Run 的真实素材和同一套领域程序生成 HyperFrames 画面。它负责播放、seek、缩放和画面选择，不从最终像素反推作者语义。

### 右上：Inspector

选择时间线实体后，Inspector 显示实体身份、时间、来源、写回能力和 adapter 明确公开的作者参数。当前呈现仍是一条扁平属性流，参数分组和未选择时的会话元信息尚未形成最终信息架构。

### 下方：Timeline

时间线显示 Semantic Segment、Word、Selection、Moment，以及 adapter 从真实 Track 投影出的媒体、音频、文字、字幕和组件实体。lane、附属关系、family、内容 shape 与允许手势由 adapter 声明；选择、播放、缩放、吸附、滚动和统一视觉由 Studio 负责。

## 作者写回

Studio 对结构化编辑只公开两类作者操作：

- `timeline.adjust`：沿实体真实时间谱系调整共享 Selection/Moment Anchor 或显式 Window 端点；
- `parameter.adjust`：修改 adapter 明确公开且带精确 Source range 的 SVML/SVS 参数。

左上源码编辑器可以替换当前 Author SVML 全文。组件 Inspector 不修改 SVRun Candidate 或 Provider 事实，也不把引用偷偷替换成匿名字面量。

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

- `packages/studio`：会话、preflight、snapshot、统一 UI、操作事务和 Source transport；
- `packages/studio-adapter`：第三方 companion package 使用的稳定数据 ABI；
- `packages/studio-video-adapters`：官方视频领域的 Track 匹配、实体投影、lane 与参数声明；
- 领域包：继续只发布运行语义和确定性值，不依赖 Studio。

Adapter 不能向应用注入任意 DOM、CSS 或前端状态。删除 Studio 后，Core、SVML、SVS、SVRun 和 Runtime 仍可独立工作。

## 尚未定案

当前明确仍需调研：

- 左上怎样浏览本次 Run 涉及的 Source、任务和真实产物；
- 右上怎样由组件声明能力大类、可选子页、参数组和控件；
- 未选择实体时哪些会话元信息应集中出现；
- 怎样恢复 prompt、参考素材、Producer、Provider、Artifact 与 Track 之间的可读依赖关系；
- Runtime 历史怎样分页读取而不新增中心 Project 数据库或拖慢 Build。

这些问题统一记录在 [Workspace 与 Inspector 信息架构审计](./studio-workspace-inspector-audit.md)，在调研完成前不固化为 ABI 或存储格式。
