---
title: SVML 视频 Track 作者模型
description: 官方 Track 包共享的可执行时间权威。聚焦的。
---

# SVML 视频 Track 作者模型

状态：官方 Track 包共享的可执行时间权威。聚焦的 `@narratage/temporal` 包实现了严格的 occurrence 展开、精确的有理数窗口投影，以及触发式的同级排程。共享的 Spatial、Text、Ranking、Media、Audio 和 Screen Overlay
现已分别在 [`spatial-layout.md`](./spatial-layout.md)、
[`typography-track.md`](./typography-track.md)、[`ranking-track.md`](./ranking-track.md)、
[`media-track.md`](./media-track.md)、[`deck-track.md`](./deck-track.md)、
[`audio-track.md`](./audio-track.md) 和
[`screen-overlay.md`](./screen-overlay.md) 中给出规范。独立设计的
`@narratage/comment-sticker` 包现在使用同一套 Temporal 与 Spatial 基础，并下降为一个同级 VisualTrack。这里刻意不构成对已发布公开 ABI 的兼容承诺。

## 目的

官方视频包需要一套共享的纪律，但不需要一个万能的 Track Program。Text、Media、Ranking 和 Comment Sticker
拥有各不相同的作者语义，但它们不得各自发明互不兼容的方式来回答同样的时间问题。

本文管辖的是包级 Program 及其确定性下降。它不会给 Core、Runtime、Composition 或某个 Provider 增加视频语义。公开的终端窄腰仍然是 [`VisualTrack` 和 `AudioTrack`](./track-composition.md)。

完整的包作者关注点分离是：

```text
content
temporal source
occurrence expansion
window projection
optional sibling sequencing
intrinsic-material occupancy
spatial source and layout
presentation
```

这些是相互独立的作者关注点，不是每个包都必须填写的字段，也不是公开 Track 合同上的字段。

## 1. 时间流水线

```text
Narrative Selection ──> { start, end } occurrences ─┐
Narrative Moment ─────> { cue } occurrences ────────┼─> occurrence expansion
Program singleton ────> { program.start/end } ──────┘
                                                        │
                                                        ▼
                                              Temporal Window Projection
                                                        │
                                                        ▼
                                           raw directed candidate windows
                                                        │
                                                        ▼
                                      ProgramSpace intersection + validation
                                                        │
                                                        ▼
                                              frame-exact projected windows
                                                        │
                                                        ▼
                                      optional package-owned sibling sequencing
                                                        │
                                                        ▼
                                                final allowed windows
                                                        │
                                                        ▼
                                      intrinsic-material occupancy / playback
                                                        │
                                                        ▼
                                        render intervals + source-time sampling
```

各层回答的是不同的问题：

| 层 | 问题 |
|---|---|
| anchor location | 某个作者写下的锚点位于哪一个物理帧？ |
| occurrence expansion | 一个作者项恰好消费一个 occurrence，还是消费每一个 occurrence？ |
| window projection | 这个 occurrence 可以占用哪一段 ProgramSpace 区间？ |
| sibling sequencing | 相关的项之间如何交接、重叠或彼此关闭？ |
| occupancy | 一个带固有时长的产物如何在自己的最终窗口内对自身采样？ |

任何 `full`、`fixed`、`relative`、`from`、`until`、`fill` 或 `fit` 联合体都不得再次把这些层压平。作者
Surface 可以提供可读的简写，但它必须下降到这个分离后的模型。

## 2. Temporal source 提供的是点，不是可渲染的窗口

一个 Selection occurrence 贡献一对有序的已定位点：

```ts
type LocatedSelectionOccurrence = {
  readonly id: string;
  readonly start: FramePoint;
  readonly end: FramePoint;
};
```

一个 Moment occurrence 贡献一个已定位点：

```ts
type LocatedMomentOccurrence = {
  readonly id: string;
  readonly cue: FramePoint;
};
```

Program source 是一个单例 occurrence。每个投影环境还拥有 `program.start` 和 `program.end` 这两个精确的
ProgramSpace 边界。

Selection 的定位必须保持 Script 中的 occurrence 顺序，以及两个作者锚点各自的身份。它不得对这些点排序、合并、裁剪、互换或取绝对差值。一个 `end` 早于 `start` 的已定位 Selection 仍然是有效的点证据。只有消费者才会创建窗口，因此只有投影层才能判定它实际消费的那些点是否构成有效区间。

组件自有的精确时间产物，比如已经定好时间的 Caption Cue，可以直接进入后面的帧窗口阶段。它不需要假装自己的时间来自某个 Narrative Selection。

## 3. 点表达式与 Temporal Window Projection

共享的投影代数在概念上是：

```ts
type TemporalPointExpression =
  | { readonly ref: "program.start"; readonly offset?: Duration }
  | { readonly ref: "program.end"; readonly offset?: Duration }
  | { readonly ref: "selection.start"; readonly offset?: Duration }
  | { readonly ref: "selection.end"; readonly offset?: Duration }
  | { readonly ref: "moment.cue"; readonly offset?: Duration }
  | { readonly ref: "absolute"; readonly at: Duration };

type TemporalWindowProjection = {
  readonly start: TemporalPointExpression;
  readonly end: TemporalPointExpression;
};
```

序列化合同将为时长使用显式单位。秒、毫秒和整数帧是三种不同的作者输入；换算到有理数 ProgramSpace 必须有唯一的确定性边界量化规则。`base_start` 和 `base_end` 是被废弃的名字，因为当前架构没有享有特权的 Base Track。

常见的作者语义都只是普通表达式：

| 语义 | 投影 |
|---|---|
| 整个 Program | `[program.start, program.end]` |
| 恒等 Selection | `[selection.start, selection.end]` |
| 从 Selection 开始起三秒 | `[selection.start, selection.start + 3s]` |
| Selection 结束之后三秒 | `[selection.end, selection.end + 3s]` |
| 从 Selection 开始一直持续 | `[selection.start, program.end]` |
| 提前两秒引入到 Selection 开始 | `[selection.start - 2s, selection.start]` |
| 某个 Moment 之后三秒 | `[moment.cue, moment.cue + 3s]` |
| 最开始的三秒 | `[program.start, program.start + 3s]` |
| 绝对时间的高级窗口 | `[absolute(2.5s), absolute(6s)]` |

`full`、`manual`、`fixed` 和 `relative` 可以继续作为创作 UI 里的表现用词，但它们不是彼此不同的编译期时间法则。

### 语义绑定可以刻意忽略局部坐标

作者可以把一个项绑定到覆盖开场几个词的 Selection，同时把它投影到 `[program.start, program.start + 3s]`。即使该投影没有用到 Selection 已定位的 start/end 坐标，这个 Selection 仍然贡献了作者语义、occurrence 身份、基数和依赖真相。

这在 `one` 之下是合法的。如下文所定义，它在 `each` 之下被刻意限制，因为重复一个与 occurrence 无关的投影只会制造出一模一样的窗口。

## 4. Occurrence 展开是严格的，且先于投影

旧的形态 `{ kind: "single", cardinality: "exactly_one" }` 把同一个事实说了两遍。可执行的合同只有两个互不重叠的选项：

```ts
type OccurrenceExpansion =
  | { readonly kind: "one" }
  | { readonly kind: "each" };
```

`each` 指的是编译期展开，不是媒体循环。作者 Surface 通过各自显式的 occurrence 设置暴露它，并下降为这个精确的值。

### `one`

`one` 遵循如下精确法则：

1. 定位完整的源 occurrence 集合；
2. 在求值投影之前，要求其基数恰好等于一；
3. 拒绝零个或多于一个的 occurrence；
4. 绝不选择 `first`、`last`、`best`、最近或最早者；
5. 把那唯一的 occurrence 恰好投影一次。

忽略 Selection/Moment 坐标的投影通常与 `one` 搭配。仅依赖 Program 的时间使用固有的单例 Program source，因此同样下降为 `one`，且不需要作者可见的基数设置。

### `each`

`each` 遵循如下精确法则：

1. 要求至少有一个已定位的源 occurrence；
2. 保持源 occurrence 的身份与源顺序；
3. 为每一个源 occurrence 恰好实例化一个投影后的 occurrence；
4. 在每个 occurrence 各自的局部点环境中独立求值同一个投影；
5. 由作者项 id 与 occurrence id 推导稳定的结果身份，绝不使用偶然的排序下标；
6. 绝不合并、去重、按时间排序、挑选优胜者或悄悄丢弃某个 occurrence；
7. 只要有任何一个 occurrence 无法产出有效窗口，就让整个确定性 Operation 失败。

当源 occurrence 多于一个时，投影的两个边界中至少有一个必须引用局部点（`selection.start`、`selection.end`
或 `moment.cue`）。只使用 Program 点或绝对点的投影与 occurrence 无关，在 `each` 之下会被拒绝：它会造出若干语义不同、物理窗口却完全相同、彼此毫无时间区分的实例。作者应当改用 `one`、绑定 Program 单例，或分别写出显式的多个项。

投影是一对一的。一个 occurrence 不能扇出成多个窗口。想从一个 Selection 或 Moment 得到两个窗口的作者，要么写两个项，要么使用一个显式构造这两个项的包自有组件。

集合聚合不是第三种通用展开模式。可见性掩码或另一个确实以集合为值的组件，可以定义包自有的集合消费者，但普通的可视项不得借这个例外找回隐式的合并、并集或去重行为。

Caption 的 `Mute` 是一个具体的包自有例子。它在 `CaptionProgram` 内部对显式引用的
`CaptionDisplayWordSubset` 取并集；它不改变通用的 occurrence 展开，不制造投影窗口，也不进入 Core。

### 基数不决定重叠

`each` 只说明一个 occurrence 集合如何展开。它不说明产生的窗口是否可以重叠、相邻窗口是否应当合并，也不说明某个项是否应当在下一个项的 cue 处关闭。这些问题在投影之前无法回答，而且还可能取决于包的语义。

投影之后，消费方的包必须为自己的组件选择并校验一种显式关系，例如：

- `independent`：重叠的窗口是有意义的，彼此保持独立；
- `disjoint`：同一个作者项的各 occurrence 之间出现任何重叠都是错误；
- 由包自有的 Sequence 或 Deck 策略推导最终的同级窗口与交接。

这种关系不属于 `OccurrenceExpansion`，也不由 Core 拥有。官方的简单 Text、Comment Sticker 以及类似的重复项，通常应当要求投影窗口互不相交。Media 组、Ranking 组件可以拥有更强的显式同级规则。任何包都不会获得隐藏的全局自动拼接行为。

### 触发式阶段属于同级排序，不是另一种 temporal source

Ranking、Tier、幻灯片以及其他渐进式组件，往往只有一组有序的触发 Moment。到达触发点 `i` 就进入状态 `i`；到达触发点 `i + 1` 就交接给下一个状态。这种情况使用的是同一套点定位与窗口投影。它不构成在 Core 里引入 `Stage`
Type 或再加一种 Script 标记的理由。

仅有 `N` 个触发点无法界定 `N` 个有限阶段：最后一个阶段仍然需要一个终止边界。因此触发式组件拥有一个显式的外层窗口 `[B, O)` 和一个显式的阶段终止点 `T`。`T` 可以引用 `O`，但包不得默认它一定如此。把两者分开，可以让 Ranking
组件在 `T` 处结束最后一项，并让完全落定的 board 一直可见到 `O`。给定已定位并已量化到帧的触发点
`p1 ... pN`，包可以推导出：

```text
stage 1  [p1, p2)
stage 2      [p2, p3)
...
stage N              [pN, T)
settled suffix                [T, O)   (when T < O)
```

`p1` 之前的区间是非活动的，而不是隐式的第零阶段。如果某个设计需要一个从外层起点到 `p1` 的初始可见状态，那个状态必须显式写出，并会产生 `N + 1` 个阶段。渲染器绝不能因为存在 board 或背景就推断出它。

这个模式有两种相关但不同的包自有下降方式：

```text
outer component       [B, O)
cumulative item 1     [p1, O)
cumulative item 2     [p2, O)
cumulative item 3     [p3, O)

exclusive stage 1     [p1, p2)
exclusive stage 2     [p2, p3)
exclusive stage 3     [p3, T)
settled suffix        [T, O)       when T < O
```

累积形态就是对 `[moment.cue, outer.end]` 做普通的 `each` 投影，外加一条显式的重叠策略。它天然实现了 Tier
board：`p2` 之后，第 1 项和第 2 项同时处于活动状态；可见的前缀本身就是当前的逻辑状态。不需要物化任何 board
快照。

互斥形态从同样的候选出发，再施加一条后继交接策略：每个候选的最终结束成为下一个候选的开始，最后一个在 `T` 处结束。这可以驱动一个 Ranking 暂存区，让它恰好展示一个当前项，同时已落定的项作为独立的累积前缀保留。当
`T < O` 时，后缀没有当前项，展示的是完成状态。包可以把这两个视图下降为同一个同级 `VisualTrack` 中相互独立的
Present。

触发式排序遵循如下精确法则：

1. 保持作者/源的 occurrence 顺序与稳定的 occurrence 身份；
2. 绝不按物理时间对触发点排序；
3. 要求至少一个触发点、一个显式外层窗口和一个显式阶段终止点；
4. 在帧量化之后，要求 `B <= p1 < p2 < ... < pN < T <= O`；
5. 原子性地拒绝逆序触发点、同帧碰撞、落在外层窗口之外的触发点，以及位于 `T` 处或其之后的最后一个触发点；
6. 只有当组件合同明确这样规定并要求基数相等时，才把有序的项列表与触发 occurrence 逐一对齐；
7. 由作者项身份与 occurrence 身份推导项/阶段身份，绝不使用数组下标；
8. 把累积重叠或后继交接保持为已声明的包语义，绝不交给 Runtime 选择。

包也可以为每个子项各配一条单 occurrence 的 Moment 边。两种作者写法都下降为同样的有序同级候选；按位置对齐不是隐式的全局行为。除非另有组件确实需要消费它们，触发式阶段只是内部的确定性下降事实。Composition 收到的仍然只是普通的 Present。

## 5. 投影校验与负区间

对每一个展开后的 occurrence，投影按如下顺序执行：

1. 在精确的有理数 ProgramSpace 中求值原始 start 和原始 end；
2. 拒绝缺失、非有限或类型非法的点表达式；
3. 若原始 end 早于原始 start，在裁剪之前就拒绝这个逆序窗口；
4. 若原始 end 等于原始 start，拒绝这个零长度渲染窗口；
5. 把方向正确的原始窗口与 `[program.start, program.end)` 求交；
6. 确定性地把它量化为半开的整数帧跨度；
7. 拒绝空结果或短于一帧的结果；
8. 只返回完全落在 ProgramSpace 之内的 `{ startFrame, endFrameExclusive }` 值。

裁剪到 ProgramSpace 是与唯一可观测渲染域求数学交集，而不是猜测时间。因此中间出现负值的点是允许的：

```text
cue = 1s
[cue - 3s, cue + 2s] = [-2s, 3s]
intersection             [0s, 3s]
```

原始的逆序区间绝不能被裁剪、排序或取绝对值掩盖过去。完全落在 ProgramSpace 之外的区间会变成空并失败；它不会被悄悄略过。渲染器只收到已经校验过的帧跨度，不做任何时间修补。

Selection 的一对交叉锚点本身并不构成投影失败。恒等投影 `[selection.start, selection.end]` 在产出逆序窗口时失败，而 `[selection.start, program.end]` 可以依然有效，因为它并不消费那个交叉的结束点。

## 6. 固有时长与占用

每一个被呈现的产物，要么拥有已验证的固有时长，要么没有。未知时长不得冒充其中任何一种；媒体检查必须先确定它，基于固有时长的占用策略才能执行。

无时长产物 —— 例如 Text、静态图片、Comment Sticker 和普通的 Ranking UI —— 占满自己最终投影出的整个窗口。局部的入场、出场和循环动画属于该窗口内部的表现，不是合成出来的素材时长。

带固有时长的产物会收到一个最终允许窗口和一条显式播放策略。概念上的可视策略是：

```ts
type IntrinsicPlayback =
  | { readonly mode: "once"; readonly align: "start" | "end" }
  | { readonly mode: "hold"; readonly align: "start" | "end" }
  | { readonly mode: "loop"; readonly align: "start" | "end" }
  | { readonly mode: "stretch" };
```

`once` 取代了含义含糊的旧词 `finish`。end 对齐绝不表示倒放。它表示正向播放的源在投影窗口的结束处结束。如果源比窗口长，start 对齐取源的头部，end 对齐取源的尾部。

| 策略 | 源短于窗口 | 源长于窗口 |
|---|---|---|
| `once/start` | 从窗口开始播放，随后消失 | 播放源的头部直到窗口结束 |
| `once/end` | 延迟出现，并在窗口结束处结束 | 播放源的尾部，并在窗口结束处结束 |
| `hold/start` | 播放完后保持最后一帧 | 播放源的头部直到窗口结束 |
| `hold/end` | 先保持第一帧，再播放到窗口结束 | 播放源的尾部直到窗口结束 |
| `loop/start` | 从源头部相位开始重复 | 循环到放不下时裁掉 |
| `loop/end` | 选择使源尾部落在窗口结束处的循环相位 | 同样的尾部相位法则 |
| `stretch` | 把源的全部时间放慢塞进窗口 | 把源的全部时间加快塞进窗口 |

Audio 必须在同一套排程之上定义自己如实的词汇。它不能像视频帧那样把一个 PCM 采样保持住。一次性音频之外是静音，补齐必须显式，循环就是循环，拉伸必须遵守作者声明的速度上下限。静态图片和无时长 UI 不接受无意义的固有播放模式。

源的 trim 与源入/出点在被加入后，作用于占用之前，用来定义有效的固有源区间。Spatial 的 contain/cover 和 Text
的 flow/shrink 作用于时间占用之后，与之无关。

## 7. 包的归属

原先那个大一统的 `contracts` 包被有意取消。名义上的共享语义由 Narrative、ProgramSpace、Media 和 Composition
等聚焦模块各自拥有；Core 没有任何视频领域联合体的注册表。

本文中的时间代数由聚焦的视频领域包 `@narratage/temporal` 实现。它拥有投影类型、validator 以及纯粹的帧窗口投影。它可以消费 Narrative 的点引用、SemanticMap 定位和 ProgramSpace，但它不得知道 Text、Media Track、
Ranking、Comment Sticker、Film、HyperFrames、Runtime 或某个 Provider。

官方包随后都使用同一份实现：

```text
Text ───────────────┐
Media Track ────────┤
Deck Track ─────────┤
Ranking ────────────┼─> @narratage/temporal ─> frame windows
Comment Sticker ────┤
Screen Overlay ─────┤
Audio Track ─────────┘
```

Caption 那份组件自有的定时 Cue 投影可以直接进入最终的帧窗口阶段。Speech Spine 确立 ProgramSpace 和连续的语音
take。其他 Track 可以通过两个结构锚点直接寻址整个 Narrative Segment，而不必假装它是一个作者写下的 Selection。

## 8. 迁移影响

当前的 `typography-track` Surface 使用共享时间包来处理 Program、Selection 和 Moment 绑定、显式点表达式，以及
`one`/`each` 展开。它不再维护第二套时间枚举。Media Track 用同一个包处理 Item 与 Sequence 的时间。

可执行的验收覆盖包括：

- Selection 与 Moment 的 `one` 成功用例及基数失败用例；
- Selection 与 Moment 的 `each`、稳定的 occurrence 身份以及源顺序的保持；
- 拒绝在多 occurrence 情况下使用与 occurrence 无关的 `each` 投影；
- 所有常见的点表达式组合，包括 Program 边界和绝对时间；
- 交叉的源锚点在不同投影下分别被消费和被忽略；
- 负偏移、ProgramSpace 求交、完全越界的窗口、逆序窗口、零长度窗口以及一帧的最小长度；
- 有理数帧率与确定性的半开帧量化；
- 多个 `each` occurrence 中有一个非法时的原子失败；
- 包自有的 disjoint、independent 和 sequence 关系与展开保持相互独立；
- 累积式与后继交接式的触发序列，包括显式终止边界、同帧碰撞、非单调的源顺序、稳定身份以及可选的显式初始状态；
- 无时长产物，以及在每一种受支持的播放与对齐策略下更短/相等/更长的固有时长产物；
- 显式的音频行为，而不是复用视觉的 `hold` 语义。

## 9. Ranking 的特化

完整的 Ranking 审查、组件拆分、组排程和可执行迁移见 [`ranking-track.md`](./ranking-track.md)。Ranking 现已验证：通用的时间代数足以支撑累积状态、互斥的当前阶段以及最终的落定后缀，而无需向 Core 或公开 Track 合同引入
Ranking 或 `Stage` 语义。

## 10. 迁移状态

Comment Sticker 的内容、布局与表现已作为独立的作者包实现；它只共享通用的 Temporal、Spatial 和终端 VisualTrack
词汇。目前已规范的 Track 家族中，没有任何一个仍被这套通用作者模型卡住。

对目前已规范的每一个官方 Track 包，已实现的验收矩阵证明 Text、Caption、Media、Deck、Ranking 和 Screen Overlay
都下降为同级 VisualTrack 值，而通用 Audio 以及可选的 Media/Ranking 声音都下降为同级 AudioTrack 值，且不改动
Core 或 Composition。

通用 Audio Track 和自包含的 Screen Overlay 现已分别在 [`audio-track.md`](./audio-track.md) 和
[`screen-overlay.md`](./screen-overlay.md) 中单独规范。Audio 复用同一套时间代数，但拥有如实的采样占用语义，而不是视觉上的 hold 语义。Screen Overlay 是一份满画布的同级贡献，不是跨 Track 的调整图层。

统一的 Item/Sequence Media 创作、全部运动通道、内部交接、显式音频投影以及 Speech Spine 受限的复用，现已在
[`media-track.md`](./media-track.md) 中规范。旧的深度堆叠 Deck 是一个独立的高阶 Track 组件，见
[`deck-track.md`](./deck-track.md)。B-roll 是一种剪辑用的 Recipe/用法，而不是另一个公开的 Track 家族。
