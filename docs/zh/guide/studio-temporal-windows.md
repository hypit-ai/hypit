---
title: Studio 三窗口
description: Studio 如何显式呈现选择、投影与消费窗口的待设计记录。
---

# Studio 三窗口

> 状态：只读呈现已经定案并开始实现；回写交互仍待讨论，不因此新增 Core 协议。

时间线上的 item 并不只是一个起止帧矩形。绝大多数 Track 先引用 Selection、Segment 或
Moment，再把它投影到帧空间，最后才由画面、声音、动画或组件内部 schedule 消费。Studio
必须保留这三个层级，不能压平后靠相同帧数、字符串 id 或组件名字猜回去。

## 关键边界：选择与投影先于领域组件

选择和投影不是组件内部偷偷完成的副作用，而是进入领域组件之前的通用前置阶段：

```text
SVML 作者表达式
  -> Temporal Projection（来源、表达式、投影帧窗）
  -> 领域组件（Media / Text / Caption / Ranking ...）
  -> 组件自己的消费窗口与 schedule
```

“出现在 SVML 里”指作者在 SVML 中声明来源和投影表达式，例如
`during={story.selection.demo}`、`at={story.moment.reveal} for="12f"` 或
`start="selection.start+3f"`；并不要求作者手写最终帧数。组件收到的是已经确定的投影结果，
因此组件不需要猜 Selection、Moment 到底对应什么，也不需要把最终矩形反推成语义来源。

这解决的是根本的边界混淆，但不抹掉组件自己的领域逻辑：例如 Ranking 仍可以在投影结果
之上计算互不重叠的 reveal schedule，Media Sequence 仍可以计算 handoff。那是消费阶段的
公开领域事实，不是组件重新解释 Selection/Projection。

当前代码已经有这条概念边界：SVML 的时间表达式、`@hypit/temporal` 的投影能力和各领域
的 programme/schedule 是分开的；部分 lowering 仍在领域函数内部直接调用 temporal helper，
这属于实现边界尚未收紧的技术债，不应被当成作者语义被组件偷偷决定。后续应把 Projection
作为显式的图中间值传入组件，并让 Studio 与组件消费同一份值。

## 实现审计：目前哪些地方仍把投影隐藏在组件里

### 根因

`@hypit/temporal` 当前只是一个 TypeScript 算法库。它的模块清单没有声明任何 Type 或
Producer，因此运行图里不可能出现一个 Temporal Projection 节点。领域 Surface 虽然把
`during`、`at/for`、`start/end` 写在 SVML 中，lowering 后却仍然把：

```text
SemanticTrack + Selection/Segment/Moment + projection spec
```

一起交给领域 Producer，再由该 Producer 内部调用 `projectSelectionWindow()`、
`projectMomentWindow()`、`projectSegmentWindow()` 或语义定位函数。作者语法是显式的，
但图上的选择/投影步骤仍是隐藏的。

`ProjectedWindow` 本身也只有拼接出的 `id` 和最终 `span`，没有公开来源种类、来源 id、
端点表达式。各领域 Program 随后通常只保存最终 `span/window`。因此运行结果不能
单独解释自己的三窗口谱系。

### 完全隐藏的领域链路

| 领域 | 当前隐藏方式 | 应显式前置的值 |
|---|---|---|
| Media Item | `appendProgram/Selection/Segment/MomentMediaItem` 内部执行窗口投影 | 一个 Projected Window |
| Media Sequence | Member activation 和 terminal 在 Sequence 内部直接定位 Moment/Selection | Projected Point / Boundary |
| Audio Clip | `appendProgram/Selection/MomentAudioItem` 内部执行窗口投影 | 一个 Projected Window |
| Typography Item | `appendProgram/Selection/MomentTextItem` 内部执行窗口投影 | 一个 Projected Window |
| Comment Sticker | 各种 append Producer 内部投影 | 一个 Projected Window |
| Screen Overlay | 各种 append Producer 内部投影 | 一个 Projected Window |
| Depth Stack | Card activation、terminal Moment/Selection 在组件内直接定位 | Projected Points / Boundary |

这些包还分别复制了时间字符串解析与 binding 分支。Media、Audio、Typography、Comment
Sticker、Screen Overlay 都各自实现了 duration、point、`during/at/start/end` 解析。这不只是
代码重复，也让“时间语言属于谁”变得含糊。

### Ranking 的特殊情况

Column 已经比其他组件更接近正确形状：Fragment 中有独立的 outer-window、candidate 和
schedule 操作。但是 outer 与 candidate 的投影 Producer 仍属于 Ranking，仍接收
`SemanticTrack + Selection/Segment` 后在内部调用 Temporal。它们应改为通用 Temporal 输出；
Ranking 只保留候选避让、clamp、非重叠 active window 和 settled phase 的 Schedule。

TierBoard 与 TopThree 已不再使用一个重复 Moment：每个 Item 各自绑定一个 Moment，Ranking
先收集 item-owned trigger candidate，再按真实帧顺序排程。outer window、每个 item point、
terminal point 后续仍应先由 Temporal 显式产出，再进入 Ranking Schedule。

### ProgramSpace 的同类隐藏

`SemanticTrack -> ProgramSpace` 已经有正式的 `semantic-track:project-program-space` Producer，
但 Media、Audio、Typography、Ranking、Deck、Film 等 Producer 仍经常接收 SemanticTrack，
在 handler 内直接调用 `projectSemanticProgramSpace()`。这不是 Selection Projection 本身，
却是同一种边界问题：已有图节点没有被连接，确定性转换被藏进消费者。只需要帧域的消费者
应直接接收 ProgramSpace；确实要读取词或 Anchor 的算法才接收 SemanticTrack。

### Studio 目前被迫做的反向拼接

由于没有显式 Projection 值，Studio adapter 当前只能：

1. 用 Program item 的运行时 id 前缀匹配作者 child id；
2. 只识别 `MediaItemSpec`、`TextItemSpec`、`PlainTextItemSpec` 等硬编码类型名；
3. 从 `during/selection/segment/at/moment` 属性名与引用 Type 猜来源种类；
4. 从 Spec 中补回表达式，从 Program 的 span 中补回最终帧；
5. Ranking adapter 再单独写一套类似的拼接。

它没有重新计算 Temporal，但仍在重建一个本该直接存在的身份链。这正是“投影被隐藏”的可见
症状：新增一个 Track family 后，Studio 无法自然理解它，必须再写一段领域猜测代码。

### 不应误迁走的领域逻辑

下面这些发生在显式 Projection 之后，仍应由领域组件拥有：

- Ranking 的候选避让、非重叠 active window、preset 和 settled phase；
- Media Sequence 的相邻成员关系、handoff、transition 和 source occupancy；
- Audio 的 source trim、loop/stretch、gain、fade 与 sample mapping；
- Motion 的 enter/body/exit 生命周期；
- Caption 的 Cue 分组、Atom 对应和显示策略。

Caption Fine 已经提供了一个接近目标的正例：Fragment 先执行
`caption:temporalize-plan`，得到具名 `TimedCaptionProjection`，随后 renderer 才消费它。
它的 Atom/Cue 时间连接是 Caption 领域语义，因此可以由 Caption 拥有；关键是连接结果已经
作为显式图值存在，而不是藏在 renderer 内。

Speech 也不是这次迁移的对象。SemanticTake 已经自带局部词窗和 Anchor，Speech Track 负责
拼装 SemanticTrack 并投影视听同源 facet；它不是某个 Selection/Moment 到组件窗口的隐式投影。

### 收紧后的目标形状

不要求把 SVML 写得冗长。`during`、`at/for`、`start/end` 仍可作为组件标签上的语法糖，
但 Surface lowering 必须先生成通用 Temporal 图操作，再把它的输出接入领域组件：

```text
SVML timing sugar
  -> Temporal projection spec + semantic source reference
  -> temporal:project-* Producer
  -> Projected Window/Point value
  -> domain append/build Producer
```

Projected 值至少必须让消费方与 Studio 观察到：作者实体 id、来源种类与 id、
端点表达式、最终帧窗。它们是 Projection 自身的定义和实际输入，不是随链路传播的“质量”元信息。
领域 Program 不必复制一份；Studio 应沿真实图边读取同一个 Temporal 输出，避免双重真相。

## 一、选择窗口

这是作者选中的语义来源，需要保留来源种类、规范 id、Semantic Track 上的 Anchor，以及
引用它的 SVML 源码范围。Selection 恰好是一个连续区间，Moment 恰好是一个点。两个来源
落在相同帧上，不代表它们是同一件事。

## 二、投影窗口

这是 Track 把一个语义来源按时间表达式投进帧空间后的结果。例如完整使用
Selection、从 Moment 前三帧开始，或从 `segment.start + 2s` 到 `segment.end`。它包括
offset 计算、Program Space 裁切与帧量化。

一个可解析的作者绑定产出一个投影窗口；组件也可能组合多个子 item 的投影窗口并施加关系，
例如算出互不重叠的 Ranking reveal。关系必须来自领域组件公开的 programme/schedule，
不能由 Studio 重新实现。

## 三、消费窗口

这是最终 Track 实际使用的窗口。它可能与投影窗口相同，但不能预设相同：Media Sequence
同时有 logical span、visual span 与 handoff；源音频有 source trim 和 target window；
Ranking 有一个外层窗口和多个内部 reveal；进入、持续、退出动画也会消费生命周期的不同
部分。Studio 应读取领域 programme、schedule、Visual Track 或 Audio Track 公开的事实，
不能从渲染 id 猜。

## 时间线呈现约定

三者是时间谱系的三层，不保证都是区间。Semantic Lane 始终显示语义来源：Selection 和
Segment 是括号区间，Moment 是精确时间点。每个 Track 的作者 item 仍用实心块表达实际
消费；它的顶部用空心细线表达投影窗口。投影与消费完全重合时也保留细线，不能因此抹掉
恒等投影。选中 item 后，Semantic Lane 会强调它绑定的来源。

组件内部 schedule 不制造额外 Track item。Ranking Column 的整个 Column 是父 item；每个
ColumnItem 是子 item，`preferred` 显示为投影线，`active` 和 `settled` 显示为同一子 item
底部的阶段条。Preset 没有独立语义投影，明确标记为由父 schedule 派生。

投影端点必须逐个保留原表达式，例如 `selection.start+3f` 和 `selection.end+3f`，不能在
Studio 中概括成一次“整体平移”。Program 给出解析后的帧窗口，Surface 真正封存的 Spec
给出端点表达式；Studio adapter 只把它们按作者实体重新组合，不重新执行 Temporal。

## 必须保留的身份链

```text
作者元素
  -> 语义绑定（种类、来源 id、源码范围）
  -> 投影表达式与投影窗口
  -> 消费实体与消费窗口
  -> 最终画面/声音实现
```

多个 Track 可以共享同一个 Selection；一个投影可以生成同源的 visual/audio facet；一个
组件的外层投影也可以展开成多个内部消费窗口。它们是共享绑定和投影，不是若干恰好重叠
的 clip。

Studio adapter registry 是解释这条链的本地中心。领域包和 Core 不认识 Studio；adapter
复用 Narrative、Temporal 和 Track family 已公开的值。如果链上某一环不可观察，就明确
显示 unresolved，绝不通过名称或相同 span 补猜。

## 回写前必须显式讨论的问题

1. 共享 Selection 如何展示所有消费者及修改影响范围。
2. Inspector 如何在语义来源、投影窗口、消费实体和最终 realization 之间切换。
3. 每种拖动到底修改哪一层：移动语义来源、修改 projection offset、裁切消费窗口是三种
   不同操作，严禁相互替代。

这些问题定案前，时间线可以选中、定位，但保持只读。可以难，不能隐式猜。
