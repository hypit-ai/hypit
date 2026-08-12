---
title: Caption Program
description: 预发布的可执行合同。
---

# Caption Program

状态：预发布的可执行合同。

## 1. 范围

Caption 是一个普通的视频组件族。它把不可变的作者显示文字变成一条自包含的 `VisualTrack`。它对
Script 的措辞、发音、语音对齐、Provider 选择、Runtime 执行和 Composition 顺序都没有任何话语权。

它的两条独立图分支是：

```text
CaptionDisplaySequence + CaptionProgram ── planner ─────────── CaptionPlan
speech audio ────────────────────────────── evidence/locator ── CompleteSemanticMap

Display + Correspondence + Plan + Program + Map ── timing ─── TimedCaptionProjection
TimedCaptionProjection + Display + Program ─────── renderer ── VisualTrack
```

planner 永远拿不到时间戳。对齐永远不做 Cue 或 Style 判断。两条分支只在显式的 timing 组件处汇合。

## 2. 显示真相：Atom 与 Word

Script 输出一份 `CaptionDisplaySequence`，它带两个有序视图：

- `Atom` 是 planner 可以整体放进一个 Cue 的最小单位，也是能够承载已证实语音时间的最小显示单位；
- `Word` 是可选的 Style 所属字段的最小作用目标。

每个 Word 恰好属于一个 Atom。Atom 对 Word 的划分恰好覆盖一次并保持顺序。文字与标点始终是作者真相：
`45%`、`back-and-forth`、`damn!`、`300,000`、`don't` 和 `U.S.A.` 原样穿过这条边。官方 Script reader
以英文优先，把作者书写的空白当作正常的显示词边界；其他作者包可以发布另一套策略，只要产出同样的公开合同。

对普通文字，一个显示 Word 通常就是一个 Atom。显式的 Dual Text 永远是一个完整 Atom，即使两侧恰好含有相同的词：

```svml
<New York City | new york city>
```

该显示序列包含一个 Atom、三个 Word：`New`、`York`、`City`。它并不声称其中任何一个显示 Word 对应任何一个口播 token。隐藏的 Dual Text（`< | um>`）不产生任何显示 Atom。

这是刻意的信息纪律：Script 只使用作者显式给出的对应关系，绝不发明作者没有给出的对应关系。

## 3. 语音对应是一条独立的边

`CaptionCorrespondence` 把每个显示 Atom 映射到一个或多个作者书写的口播 token 身份。它与
`CaptionDisplaySequence` 相互独立；显示侧的消费者不必携带自己用不上的语音血缘。

对普通文字，每个 Atom 映射到该显示表面在结构上拥有的那些口播 token。对 Dual Text，整个显示 Atom 映射到整段右侧口播区间。不存在公开的“显示 Word 到口播 Word”的映射，也不存在猜出来的内部时间。

Script 还会为显式的 Selection 输出 `CaptionDisplayWordSubset` 值。Role 选择器是同一份显示序列之上的作者面语法糖。子集是有序的，可以选中零个或多个完整 Atom；只选中一个多词 Atom 的一部分属于作者错误。这些值不是时间性的 `NarrativeSelection` 值，也不会引入第二套 `when` 语言。

## 4. 完整的 Style 意图

一个 `CaptionStyle` 是一份完整的作者声明，包含：

- 通用的规划要求：偏好的 Cue 词数上下界，以及零个或多个带类型的 per-Word 字段声明；
- 一个渲染族身份，以及该族经 Recipe 解析后的完整参数。

公共 Caption 包只拥有 Cue 与字段的数据形状，不拥有字体、盒子、颜色、动画，也不定义字段 id 的含义。一个 Style 族可以不声明任何字段。布尔、枚举和有界数值字段对其他族同样可用；一个 Word 可以携带零个、一个或多个互相独立的字段。

SVS 存放具名的 Recipe 数据。Style 包解释这份 Recipe 并输出一份完整的 Style。应用另一个 Style 会整体替换原 Style；规划与渲染的零散片段绝不会被隐式合并。

## 5. 全覆盖赋值与有序替换

每个 `CaptionProgram` 都有一个显式的 default Style，覆盖完整的显示全集。作者无需伪造 `@whole`
Selection，也不必写补集。

```xml
<caption:Program id="captions" display={story.caption} default={plain}>
  <caption:Use role="ALICE" style={alice}/>
  <caption:Use words={story.caption.selection.special} style={impact}/>
  <caption:Mute words={story.caption.selection.private}/>
</caption:Program>
```

Use 按源码顺序生效，最后一个命中的整体 Style 替换获胜。Program 存的是显示序列身份和有序的 Word id
区段，而不是复制出来的文字。一个区段绝不跨越 Segment 或 Turn 边界。所有区段互不相交，对显示 Word 恰好划分一次，且任何区段都不得把一个 Atom 拆开。

`Mute` 消费的是与 `Use` 相同的、Caption 专有的整 Atom 词子集。多个 `Mute` 子节点构成一个有序并集，因此一个 Program 可以隐藏任意多段互不相连的作者区间。`Mute` 是规划之后的可见性意图：被 mute 的 Atom
仍然留在不可变的显示全集和 `CaptionPlan` 中，绝不会作为指令进入 planner 提示词，也绝不触发 Cue 重新规划。公共的 timing join 会把被 mute 的 Atom 从已经规划好的定时 Cue 中移除，同时保留该 Cue 的身份和原有时间跨度；一个没有任何可见 Atom 的 Cue 不出现在定时视觉投影中。因此各 Style 族的渲染器共享这一行为，不必各自发明自己的遮罩语义。公共包还导出同一个幂等操作，供直接调用渲染器时做防御性处理。

这刻意不是一个通用的时间遮罩。Script 已经把作者的 Selection 投影成了精确的显示词子集，因此 Caption
无需把词换算成时间、再从重叠窗口里把词猜回来。只选中多词 Dual Text Atom 一部分的 `Mute`，会被与
Style 应用相同的不可分割规则拒绝。

`display={story.caption}` 是一条真实的图边。planner、timing 和渲染只在自己需要时，各自声明指向同一个值的边。

## 6. planner 合同

planner 接收已解析的区段。对每个区段，它只能：

1. 把连续的完整 Atom 编组成有序的 Cue；
2. 给每个 Cue 内的 Word 赋予已声明的字段。

Cue 必须对每个区段恰好划分一次。偏好的 Cue 最小/最大词数只是对 planner 的引导，不能让作者文字失效；单个多词 Atom 可以超过最大值，并且必须保持完整。响应中不包含任何替换文字、发音、时间戳或 Style。

Gemini planner 只发送一次可读形式：

```json
{
  "atoms": [
    ["new"],
    ["york"],
    ["city", "is", "beautiful"]
  ]
}
```

外层数组是 Cue 的可切分全集。每个内层数组是一个不可分割的 Atom。其中的字符串是不可变的字段作用目标。稳定 id 留在包内部。响应通过 `atom_count` 消费 Atom；字段在其 Cue 内使用从 1 开始的 `atom_number` 和
`word_number`。

## 7. 时间投影

`CompleteSemanticMap` 仍然是唯一的全局语音时间真相。timing 组件通过 `CaptionCorrespondence` 解析出每个
Atom 的显式口播 token 区间，并给整个 Atom 一个实测窗口。一个 Cue 从它的第一个 Atom 开始，到它的最后一个
Atom 结束。

因此 `TimedCaptionProjection` 只包含定时的 Cue 和定时的 Atom。它不包含 per-display-Word 的时间戳，没有 `estimated` 质量标签，也没有按字符比例的切分。对于多词的 Dual Text Atom，下游渲染器可以自行决定如何排布或动画其内部 Word，但不得声称拥有编造出来的词级时间。任何内容都不会写回 SemanticMap。

## 8. 渲染与合成

每个定时 Cue 选出其解析后 Style 的完整渲染负载。一个 Style 族渲染器返回一条普通的 `VisualTrack`。在首版合同中，一个 Program 内的所有 Style 使用同一个渲染族。

`@narratage/caption-fine` 是第一个官方族。它不声明任何字段，拥有一套正交的单字体 layout/Paint/motion
系统，包括互相独立的整 Atom 字形、下划线和 Pill 激活。其他包可以定义不同的 layout 树或依赖字段的
Paint，而无需改动 Script、Caption、Composition 或 Core。

Film 不对 Caption 做特殊识别。它把产出的对等 Track 与 Speech、B-roll、Text 以及第三方 Track 并排折叠。

## 9. 显式的非目标

Caption v1 不定义：

- Script 纠错或替代措辞；
- 推断出来的 Dual Text 词级对应；
- 说话人分离或说话人身份；
- 隐式的模型或 Provider 路由；
- 自动的缓存复用；
- 估算出来的显示词时间；
- planner 可见或由 Core 拥有的 Caption mute 语义；
- Composition 中的全局 Caption 图层；
- Core 中的字段专有语义。

Target 与 Candidate 仍然是外部的运行意图。它们不改变 Caption 数据，也不改变 planner 语义。
