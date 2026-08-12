---
title: SVML 深度栈 Deck Track
description: 官方深度栈 Deck 迁移的已实现可执行权威，记录旧 Deck 实现的行为。
---

# SVML 深度栈 Deck Track

状态：官方深度栈 Deck 迁移的已实现可执行权威。它记录了旧 Deck 实现所使用的行为，但它不是冻结的
公开 ABI，也不定义通用的 Deck 协议。

## 1. 结论

Deck 不是 Media Item 的一种模式，也不是 Media Track 的第三个原语。它是更高阶的视觉组件，只是它的
成员恰好使用了媒体素材。

第一个官方实现是 `@narratage/deck-track`。它诚实的作者含义是一个**深度栈 Deck**：

```text
ordered Cards
semantic activation points
current Card
visible previous/future neighborhood
relative-depth layout
whole-collection state transition
ordinary VisualTrack output
```

它与 Media Track、Text、Caption 和 Ranking 是同级关系：

```text
Media Item / Sequence ─┐
Depth-Stack Deck ──────┤
Text ──────────────────┼─> ordinary VisualTrack values ─> Composition
Caption ───────────────┤
Ranking ───────────────┘
```

Core、Film、Composition 和 HyperFrames 都不知道某个贡献来自 Deck。

## 2. 为什么 Deck 在 Media Track 之外

Media Item 回答的是单个素材如何呈现。Media Sequence 回答的是成员如何在同一个共享表面上相互替换。
深度栈 Deck 回答的是另一个问题：当当前成员改变时，整个有序集合如何改变姿态。

在同一帧上，一个 Deck 可能同时显示：

- 当前 Card；
- 若干保留下来的历史 Card；
- 若干未来的预览 Card；
- 按相对深度区分的不同偏移、缩放、旋转、不透明度和色调；
- 一次让每个保留 Card 从旧姿态移动到新姿态的转场。

这是集合状态，而不是源采样、适配或“出场 / 入场”成对交接。把它留在 Media Track 里，会让一个历史遗留
的呈现模型看起来像通用的媒体原语。

## 3. 目前还没有通用的 Deck 合同

“Deck”当前是一个设计家族，不是共享的公开 Type。其他有价值的模型可能具有本质不同的拓扑：

- 水平或环形 Carousel；
- 扇形布局；
- Cover Flow；
- 带有一个特殊当前成员的网格；
- 自由拼贴；
- 时间轴历史；
- 看板与条目一同演化的 Ranking 板。

这些包可以定义不同的作者 Surface、校验与 lowering，它们只需要发出终端 `VisualTrack` 合同即可。只有当
多个真实实现证明存在一条更小的共同法则之后，我们才应该抽出共享的 Deck 库。仅仅共用“Deck”这个名词，
不构成设立中心协议的证据。

因此第一个包应该暴露一个诚实的组件名，例如 `DepthStack`，而不是声称它的字段描述了所有可能的 Deck。

## 4. 包边界

预期的关系是：

```text
@narratage/temporal       point location and exact trigger schedule
@narratage/spatial        Canvas, Placement Frame and fitted geometry
@narratage/media          normalized still/timed/Surface material
@narratage/media-track    focused reusable media-layer lowering implementation
@narratage/deck-track     DepthStack author Program, state and reflow lowering
@narratage/composition    terminal VisualTrack waist
```

`@narratage/deck-track` 可以复用 Media Track 中聚焦的实现函数，或者后续某个纯实现层的媒体 lowering 库。
这种代码复用并不会让 Deck 变成 Media Track 组件，也不会通过 Core 暴露通用的 `MediaProgram` 或
`DeckProgram`。

这个包不做以下事情：

- 生成 Card 的图像或视频；
- 选择 Provider 或凭据；
- 从 URL、目录或媒体元数据推断 Card；
- 检视另一个 Track 或已累积的下层合成结果；
- 预留全局的 stacking 区段；
- 向 Core、Film、Composition 或 HyperFrames 添加 Deck 语义。

每个 Card 的来源、标签、触发点和声音依赖都是显式的图引用。

## 5. 示意性的作者 Surface

语法尚未冻结，但包的归属应当可见：

```xml
<deck:DepthStack
  id="proof-stack"
  map={timing.map}
  space={speech.space}
  canvas={vertical}
  frame={layout.lower-proof-stack}
  until={story.selection.proof.end}
  appearance={studio.deck.proof}
>
  <deck:Card id="proof-1" source={proof1.image} at={story.moment.proof1}/>
  <deck:Card id="proof-2" source={proof2.image} at={story.moment.proof2}/>
  <deck:Card id="proof-3" source={proof3.video} at={story.moment.proof3}/>
</deck:DepthStack>
```

组件本身产出一个普通的 `VisualTrack`。它不嵌套在 `<media:Track>` 里，也不通过 `mode="deck"` 选择。

SVML 拥有拓扑：有序的 Card 成员关系、source 边、trigger 引用、终止点、Frame 以及可选的标签输入。SVS
拥有可复用参数：可见邻域、深度姿态、frame Paint 和 reflow 运动。SVS 不能创建 Card、隐藏 source 边或
选择 Provider。

## 6. 精确的状态模型

设作者声明的 Card 激活帧为：

```text
p1 < p2 < ... < pN < T
```

其中 `T` 是显式的终止点。在帧 `f` 上：

```text
current(f) = greatest i such that pi <= f
```

在 `p1` 之前，除非有显式的初始状态策略另行规定，组件处于非激活状态。在 `T` 及其之后，除了作者显式声明
的退场运动之外，组件同样处于非激活状态。

包会校验作者声明的出现顺序。它绝不会把相等、逆序或缺失的 trigger 点整理成一份看似合法的呈现。

可见性是显式的包参数：

```ts
type DepthStackVisibility = {
  readonly previous: number;
  readonly next: number;
  readonly wrap: boolean;
};
```

每个可见 Card 都会围绕 `current(f)` 得到一个整数相对深度。一个纯函数把该深度映射为它的姿态：

```ts
type DepthStackPose = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotationDeg: number;
  readonly opacity: number;
  readonly stacking: number;
  readonly tone?: DeckCardTone;
};
```

公开的作者模型应当暴露具名的 pose / visibility Recipe，而不是要求作者把整张表内联重复一遍。

## 7. Reflow 是集合级的状态转换

当 Card `i` 成为当前项时，在旧状态或新状态中可见的每一个 Card 都会得到一个旧姿态和一个新姿态。reflow
转场以一个精确时长和一条缓动法则在这两个姿态之间插值。

这与 Media Sequence 的交接不同：

```text
Sequence transition   coordinates outgoing member + incoming member
Deck reflow           coordinates the union of old-visible + new-visible Cards
```

它们不得共用同一个 `transitionStyle` 联合类型。Card 还可以拥有自己的当前项强调效果，但它不能改动属于
另一个 Track 的像素。

渲染器把状态和姿态求值为绝对帧号的纯函数，不保留可变的“上一帧”状态。因此任意帧渲染、分块 Lambda 渲染
和乱序帧求值都保持确定性。

## 8. Card 素材与播放

每个 Card 都可以复用与 Media Item 相同的显式 layer、Content Fit、裁剪和 frame Paint 法则。这属于实现
复用，不是作者模型的继承。

带时间的 Card 源必须定义它在非当前项时如何采样：

```text
future preview   hold source head, or sample an explicitly selected visible clock
current Card     sample according to its authored active-phase occupancy
past trail       hold source tail, continue, or hide according to explicit policy
```

静态素材不需要播放策略。视频绝不能在仅作为未来预览时悄悄播完。

Card 标签是可选的显式 Text 输入。Deck 包可以复用 typography lowering，但它不能从文件名、URL 或隐藏的
图像元数据推导 Text 事实。

初版 DepthStack 只有视觉。如果后续某个 Deck 组件要暴露源音频，它必须以独立且显式的 `AudioTrack` 投影
提供，并带有作者声明的当前成员 / 交接法则；音频绝不能仅仅因为某个 Card 的容器里含有音频流就变得可闻。

## 9. Stacking

Deck Track 没有 Track 级 z-index，也不创建 stacking context。当同级 Track 需要插入其间时，看板 / 背景与
各个 Card 可以 lower 成各自独立的绝对 stack Present。

相对深度只决定自有 Card 之间的顺序。reflow 期间的临时顺序也只存在于这一显式关系内部，它不会分配全局 z 段。

## 10. 从旧实现迁移

从旧 Deck 实现中保留：

- 作者显式声明的 Card 顺序；
- 由语义 trigger 驱动的当前状态；
- 可配置的 previous / future 可见性；
- 有限或显式的环绕行为；
- 深度偏移、缩放、交替旋转、不透明度和色调；
- 整组的入场、持续与退场运动；
- 全组插值 reflow；
- frame Paint、内边距、圆角、描边和阴影；
- 确定性的帧内局部求值。

废弃：

- 把 Deck 当作 B-roll 或 Media 的一种模式；
- 隐式的 `linkNext` 拓扑；
- 藏在“一般位于人脸下方”背后的放置语义；
- 从源元数据自动生成标签；
- 下层合成结果参与的转场；
- 泳道级的全局声音默认值；
- 在 Core、Film、Composition 或 HyperFrames 中的任何注册表条目。

## 11. 实现与验收顺序

1. 实现共享的 Temporal 与 Spatial 切片；
2. 暴露 `DepthStack` 和显式的有序 Card；
3. 求解精确的 trigger 状态与有限可见性；
4. 为 Card 内容复用聚焦的媒体层 lowering；
5. 加入纯粹的相对深度姿态求解；
6. 加入集合 reflow 与整组生命周期运动；
7. 证明静态与带时间素材的非激活播放行为；
8. 迁移一个真实的旧系统 Deck，并且只有在验收矩阵通过之后才冻结。

第 1–8 步在 `@narratage/deck-track` 中执行。包测试覆盖下文列出的每一种状态、校验、播放、标签和扩展场景。
真实的 HyperFrames 见证会渲染一个旧风格的三 Card 深度栈两次——一次单 worker、一次三个分区 worker——并
逐字节比较每一帧解码结果，同时证明每个作者声明的当前状态都被绘制出来。这完成了 Deck 包的验收矩阵，独立
的通用 E1–E8 终端 VisualTrack / Visual IR 关卡现在也已通过。

要求的证据包括：

- 只有 previous、只有 next 以及混合的邻域；
- 零个、一个和多个可见邻居；
- 有限边界与显式环绕；
- 缺失、相等和逆序 trigger 的拒绝；
- 深度姿态、交替旋转、不透明度和色调；
- 硬切与插值两种全集合 reflow；
- 静态与带时间 Card 的采样法则；
- 可选的精确字体标签；
- 整组入场 / 持续 / 退场且不覆盖 Card 姿态；
- 顺序、分区和乱序渲染下逐字节一致的帧；
- 安装另一个 Deck 包时，无需改动 Core 或第一个 DepthStack 包。
