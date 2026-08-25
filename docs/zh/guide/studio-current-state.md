---
title: Studio 当前架构边界
description: Studio 的启动单元、四区职责、作者写回、时间谱系与包边界。
---

# Studio 当前架构边界

> 本文只记录当前实现和稳定职责。领域组件、独立 Hypit Studio Companion 与 Studio 应用的三层边界，见 [Studio Companion 架构](./studio-companion-adapter-architecture.md)。右上 Inspector 与数据依赖可见性的下一阶段问题，见 [Studio Workspace 与 Inspector 信息架构审计](./studio-workspace-inspector-audit.md)；空间、字幕、时间消费和参数可达性所依赖的视频领域基础，见 [视频领域协议迁移与基建审计](./video-protocol-foundation-audit.md)。审计文档不是实施规格。

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

未选择实体时，Inspector 集中显示 Canvas、Author、Run、Source closure 与 Build intent。选择时间线实体后，顶栏替换为 `Where / How / When` 三个受控能力标签，并且只出现当前实体实际拥有内容的标签；下方可有 Companion 声明的二级页，再按参数组显示可调整字段。选中状态不再展示身份、时间谱系、Source 路径或其他只读常值。

Companion 分开声明作者 `bindings` 与可见 `inspector` 字段：binding 只负责精确到达 SVML/SVS Source，也可供时间线逆变换使用；只有被 Inspector 表选中、当前真实存在且可写的 binding 才进入右侧。一级能力、控件外观、写回事务由 Studio 拥有；二级页、参数组、字段标签、顺序与 binding 映射由独立 Companion 拥有；领域组件 Manifest 不承担 Studio 页面语义。

当前统一控件包括文字、数字、开关、下拉、“取色器 + 精确色值”，以及由这些原子控件组成的通用 `list` 和扁平 `record`。结构化字段先在浏览器中形成本地 draft，支持按 schema 增删、排序和编辑，只有显式 Apply 才把整个 canonical value 作为一次 `parameter.adjust` 原子写回。值的类型、颜色格式、枚举、数量和 record 字段来自领域 Recipe vocabulary；SVS 负责解析与序列化。Studio 和 Companion 都不包含 `rank-colors` 一类领域专用 codec。

### 下方：Timeline

时间线显示 Semantic Segment、Word、Selection、Moment，以及 Companion 从真实 Track 投影出的媒体、音频、文字、字幕和组件实体。lane、附属关系、family、有限 chrome、标题与有序内容层由 Companion 声明；时间文本、选择、播放、缩放、吸附、滚动和统一渲染由 Studio 负责。作者对象与投影/渲染对象身份不同时由公共 `subjectId` 明示，Studio 不拆 renderer id。Companion 只传 Artifact digest 或 Surface 身份，不知道 Studio 的 HTTP 路由。

## 作者写回

Studio 对结构化编辑只公开两类作者操作：

- `timeline.adjust`：沿实体真实时间谱系调整共享 Selection/Moment Anchor 或显式 Window 端点；
- `parameter.adjust`：修改 Companion 明确公开且带精确 Source range 的 SVML/SVS 参数。

左上源码编辑器可以替换当前真实闭包中选中的 SVRun、SVML 或 SVS 全文。组件 Inspector 不修改 SVRun Candidate 或 Provider 事实，也不把引用偷偷替换成匿名字面量。

每次结构化操作都携带当前 Snapshot revision。服务端重新解析操作目标、生成最小 Source 修改，再用同一 Run 重新编译预览；成功才发布新 Snapshot，失败则恢复 Source。完整边界见 [Studio 作者操作](./studio-timeline-operations.md)。

## 时间谱系

Studio 保留三层不同事实：

```text
作者选择（Program / Selection / Segment / Moment）
  -> 投影（TemporalInstant / TemporalWindow）
  -> 组件消费与最终 Track 实体
```

谱系来自本次 Run 实际执行闭包中的 Temporal Record 与消费者边；作者 Source 端点来自同一次
编译产生的 `AuthorProvenance`。Studio 不再按本地 output 名、raw id、文件后缀、运行时 id、
renderer id 或相同帧区间重新猜测。缺失的链路保持 unresolved。详见
[Studio 时间谱系](./studio-temporal-windows.md)。

## 包边界

以下列表描述当前代码，并不取代 [Companion 架构](./studio-companion-adapter-architecture.md)：

- `packages/studio`：会话、preflight、snapshot、统一 UI、操作事务和 Source transport；
- `packages/studio-adapter`：官方和第三方 Companion 使用的稳定数据 ABI；
- `packages/*-studio`：各官方领域的 Track Companion 分别拥有 Track 匹配、实体投影、lane、Source binding 与 Inspector 字段；公共时间逆变换由 Temporal 运行谱系统一提供；
- `packages/film-studio`：声明 Film 如何指向唯一 Semantic Track 与同行终端 Track，不把 Film 语法写进 Studio；
- `packages/script-studio`：声明 Script Source map 与 Selection/Moment marker 逆写，不让 Studio 依赖 Script parser；
- 领域包：继续只发布运行语义和确定性值，不依赖 Studio。

Companion 不能向应用注入任意 DOM、CSS 或前端状态。删除 Studio 后，Core、SVML、SVS、SVRun 和 Runtime 仍可独立工作。

## 2026-08-25 实施断点

这一轮已经完成并推送的 Studio 基建如下：

- 官方领域已拆成各自独立的 `*-studio` Companion；官方组件和第三方组件遵循同一边界，领域包不依赖 Studio；
- Studio 核心不按模块名、Surface 名或属性名猜实体外观、Inspector 字段与控件类型；官方 Companion 使用显式且封闭的字段表，领域新增属性没有对应声明时直接暴露错误；
- Companion 用 `bindings` 与 `inspector` 分别声明作者端点和面板展示；时间线逆变换改由公共 Temporal 运行谱系的 endpoint authority 自动推导，不再让每个 Companion 重写；
- `<script id>`、Semantic Track id、ProgramSpace id、Track `programSpaceId` 与 Temporal `subjectId` 已形成连续公开身份链；Studio 按当前 ProgramSpace 的 `narrativeId` 精确选择写回 Script，不再取第一份 Script 或按同名猜测；
- SVS canonical value 已能直接表达和精确写回数组与对象；Studio ABI 已提供受控的 `list`、扁平 `record` 与 `color` 组合；
- Ranking 的 `rank-colors`、固定三个的 `slot-colors` 和 Tier `rows` 已成为领域 vocabulary 中的有类型值，Studio 只渲染通用控件，不识别 Ranking；
- Source、Tasks、Artifacts、Preview、Inspector 与 Timeline 的当前布局和职责已经落地；未选择实体时只显示会话级信息，选择实体后只显示真实可调字段；
- `parameter.adjust` 继续使用精确 Source range、Snapshot revision、最小替换、重新编译和失败恢复；结构化值没有引入新的操作类别或第二份状态。

这些能力已经沿 Companion 边界闭合；反向编辑的 Source 来源现由编译器 provenance 明确承载，
不再依赖单文件内名字恰好相同。后续演进不得重新引入中央组件判断、属性名启发式、专用控件、
项目数据库、运行锁或哈希清单。

## 尚未定案

当前明确仍需调研：

- Inspector 后续是否需要字体、媒体引用等新的统一控件，以及嵌套作者实体怎样获得自己的选择上下文；
- 怎样恢复 prompt、参考素材、Producer、Provider、Artifact 与 Track 之间的可读依赖关系；
- Runtime 历史怎样分页读取，避免长期积累后逐个读取全部 Build 状态，同时不新增中心 Project 数据库或拖慢 Build；
- Artifacts 的视频海报、详情与复用动作应如何惰性提供而不污染 Build truth。

这些问题统一记录在 [Workspace 与 Inspector 信息架构审计](./studio-workspace-inspector-audit.md)，在调研完成前不固化为 ABI 或存储格式。

字幕派生 Cue 的参数链、未写可选参数、嵌套 Media 作者对象及组件声明边界不只是 Inspector 布局问题。它们记录在
[视频领域协议迁移与基建审计](./video-protocol-foundation-audit.md)，需先明确领域作者事实，再决定 Studio ABI。
