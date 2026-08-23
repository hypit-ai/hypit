---
title: Studio 当前状态与左右面板边界
description: 记录 Studio 当前可用链路、时间线实现、启动方式，以及左上 Workspace 和右上 Inspector 的下一阶段边界。
---

# Studio 当前状态与左右面板边界

> 本文是当前实现的收口记录，不是新的交互规格。未定案的功能明确标为“待设计”，不在界面里偷偷猜测。

## 一、Studio 如何启动

Studio 不是独立构建器，也不会在打开时调用 Provider、创建 Build 或访问 Gemini。它复用一次已经明确配置好的 `.svrun` 作为启动输入：

```text
hypit-studio --run <project>/build.svrun
              [--workspace <project>]
              [--runtime <project>/hypit.runtime.json]
```

启动前会做 Studio 专属 preflight。当前第一版要求 Run 明确声明 Film/Render 目标，并且能从真实 Candidate 或确定性结果反追溯出 Studio 要展示的实体。只有一个最终视频文件、没有可追溯的 Track/Candidate 时，不允许 Studio 静默猜出时间线。

打开过程只读取 Run 的 snapshot、source 文件、Candidate 满足结果和已有 preview。Studio 的修改目标是 SVML/SVS/SVRun 的作者源文件；Provider 和外部生成不属于打开 Studio 的副作用。

## 二、当前四区

### 左上：Source

当前显示真实 SVML 源码，带行号、滚动和源码选择联动。它仍然是一个源码面板，不是一个完整的项目浏览器。

下一阶段可以把它提升为 Workspace，但必须以真实启动上下文为来源：

- **Source**：当前 SVML、导入的 SVS/SVRun 源码；
- **Runs / Tasks**：当前 workspace 中已发现的 `.svrun` 及其状态，状态只能来自 Run/preflight，不凭 UI 自造；
- **Artifacts**：当前 Run 已声明或已满足的输出，来源是 Candidate/Artifact 引用，不扫描目录后冒充结果；
- **Files**：当前 workspace 中被 source closure 实际读取的文件。

这些视图属于 Studio 会话层。它们不注册回 Core，也不把项目文件复制进 `packages/studio`。第一版仍以 Source 为默认视图，不用假按钮占位。

### 中上：Preview

Preview 使用 Run 已有的 Film/Render 输出和 HyperFrames snapshot。它负责播放、seek、缩放和画面查看，不负责从最终画面反推作者语义。没有明确 preview candidate 时，启动失败或显示明确失败原因，不做静默降级。

### 右上：Inspector

当前未选中实体时，Inspector 保持安静，只显示少量真实的 Run/画布/时基元信息；不显示教程文案、AI 状态词或重复的分辨率/帧率信息。

当前选中实体后，Inspector 的数据顺序固定为：

```text
实体标签（family / facet / 名称）
  -> 来源标签（SVML / SVS / SVRun / Candidate）
  -> 可见领域属性
  -> 时间与空间属性
  -> 写回能力与禁用原因
  -> 运行来源
```

“上 tag、内部 tag、逐项列表”只是视觉分组，不意味着复制三份真相。每一项必须带有 source range、来源文件、作者值/计算值、是否可写和明确写回目标。没有精确回写映射的操作继续只读。

## 三、当前时间线

当前可见的基础实体包括：

- Speech 的语义 Segment/Word，以及同源的 Picture、Voice facet；
- 普通 Media、Audio、Text、Caption；
- Ranking 根轨和其已声明的附属 Reveals 轨。

Speech 的 Picture/Voice 使用普通 Media/Audio 的内容外观，附属关系只由 adapter 声明，Studio 负责邻接、缩进和统一表头。附属轨不再依赖末尾堆叠或可折叠状态。

本轮已完成的时间线收口：

- 表头列改为可拖动、有限范围的宽度，并与右侧 lane 使用同一纵向几何；
- 文字统一左对齐；普通轨显示 family 图标，附属轨显示中性的分支标记；
- 删除了旧的附属轨折叠状态和 `expandedByDefault` 协议字段；
- 选中框恢复为统一的外部细描边与端帽，只提高亮度，不在内容内部叠加额外 keyline；
- 尺寸、圆角、颜色、交互反馈仍由 Studio 中心层统一，adapter 只声明 family、shape、附属关系、实体和写回能力。

当前仍明确未完成：

- 左上 Workspace 的 Source/Files/Runs/Artifacts 正式切换界面；
- 右上 Inspector 的最终剪映式标签层级和未选中元信息布局；
- 时间线中 Selection/Moment 的独立可视化与投影线；
- move/trim 等时间线手势的完整写回。没有唯一 SVML/SVS/SVRun 映射的操作必须保持禁用。

## 四、包边界

`packages/studio` 只拥有会话、反追溯注册、snapshot、Inspector 和统一 UI 语法。领域包只发布自己的真实输出、实体和确定性值；它们不认识 Studio，也不注册 UI。

`packages/studio-adapter` 是 Studio 与外部作者包之间的开放 ABI。它描述“如何找到、反追溯、显示和写回”，不携带 CSS 色值，也不把一方组件名枚举进 Core 协议。

`packages/studio-video-adapters` 只提供视频领域的实体投影和 lane family；Studio 删除后，Core、SVML、SVS 和 SVRun 仍可独立运行。

## 五、清理结论

本次审计没有发现可安全删除的 Studio 文档或测试：现有 Studio 文档分别记录视觉基线、时间线操作边界、Selection/Moment 重构和三窗口架构；Studio 包没有独立死测试。官网侧仍有被入口引用的旧 Playground/品牌组件，属于官网迁移范围，不能在本次 Studio 收口中孤立删除。

以后新增设计应先补充本记录或对应专题文档，再进入代码；不把未定案的任务列表、产物列表、标签层级或投影表现偷偷硬编码进时间线。
