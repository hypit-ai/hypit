---
title: Studio 时间谱系
description: 作者选择如何成为 Instant 或 Window，并准确回到真正的作者源。
---

# Studio 时间谱系

时间只有三层：

```text
选择层（Program / Selection / Segment / Moment）
  -> 投影层（TemporalInstant / TemporalWindow）
  -> 消费层（Programme / Schedule / Track）
```

Script 的语义标尺包含严格有序的 `2M + 2N + 2` 个点：Token 与 Segment 的首尾，再加彼此
独立的 Program start/end。Program 锚点由 SemanticTrack 在 `0` 和 `frameCount` 解析，不需要
伪造进某个 SemanticTake。它们是 Selection/Moment 可选择的作者语义点；这不会让
`during="program"` 变成可写，后者依然是结构固定的投影。

`@hypit/temporal-markup` 统一拥有 SVML 时间语法，并在领域组件运行前把它降低成普通的投影
组件和运行图边。编译器只会组合 Record、Component 和 Fragment，不认识 `during`、`at`，
各 Track 也不再各写一套找帧算法。运行图还会通过 Semantic Track 的公共 producer 显式投影
`ProgramSpace`；领域组件只消费 ProgramSpace 与时间投影结果，与选择层和 Studio 都解耦。

## 运行时对象

`TemporalInstant` 保存运行时求值来源、精确点表达式、解析后的帧，以及一个作者 authority：

- `semantic`：作者权威在 Selection 或 Moment；
- `parameter`：作者权威在组件表面的某个作者时间参数；
- `fixed`：Program 或 Segment 结构决定，不开放轻量反写。

身份链全部来自作者声明，不由 Studio 临时生成：

- `<script id="story">` 产生 `Narrative.id = story`，它派生出的 Selection、Moment、Segment
  excerpt 与 CaptionDocument 全部携带 `narrativeId = story`；
- 被 Film 激活的 Semantic Track 的 `id` 就是 `ProgramSpace.id`，所有终端 Track 都携带同一个
  `programSpaceId`；
- 每个 Instant/Window 同时保留这两个身份，并用消费者的公开领域身份（通常就是 SVML `id`）
  作为 `subjectId`。

投影 record 的 `id` 可以为了展开后的图内唯一性带父级前缀，但它不是作者身份；`subjectId`
独立保留组件公共 Program 发布的 board、card、item 或 sequence 身份，Companion 只沿这一
身份接回实体。

这些是公开运行 provenance，不是随机哈希，也不是 Studio metadata。于是同名 Selection 来自
另一份 Script、或 Track 属于另一条时间轴时，会在边界处明确拒绝，不再靠“当前第一个”碰运气。
因此 Script id 在当前 Source closure 中必须唯一；两份不同 Script 声明同一个 id 时，Studio
不会等到逆写时再挑一份。Script Surface 把 `Narrative TypeRef + id` 声明为领域公开身份，
Elaborator 在整个 Source closure 编译期通用去重。编译器不认识 Script 或 Narrative，也不禁止
不同领域、不同父对象中的同名子项。

`TemporalWindow` 由两个完整 Instant 组合而成。两个端点可以有不同来源、不同 authority，
所以 Window 不再伪造一个“共同 source”。`program.end` 是合法 Instant，不再伪装成一帧窗口。
越出 ProgramSpace 的 Instant、反向窗口和零宽窗口直接拒绝，不裁切、不修复。

## 作者模式

| 写法 | 起点 authority | 终点 authority | 时间线写回 |
|---|---|---|---|
| `during={Selection}` | Selection start | Selection end | Script markers |
| `during={Segment}` / `during="program"` | fixed | fixed | 只读 |
| `at={Moment} for="…"` | Moment cue | parameter `for` | Script 与 SVML 可原子组合写回 |
| `until={Moment} for="…"` | parameter `for` | Moment cue | Script 与 SVML 可原子组合写回 |
| `start="…" end="…"` | `start` | `end` | 组件表面的 SVML 时间参数 |

点消费用 `at={Moment}` 或 Selection 的明确边界表达语义 authority；没有语义意图时用
`instant="…"` 兜底。`at="moment.cue+3f"` 会被拒绝，因为这种写法没有说清作者想移动
Moment 还是偏移量。

## Studio 如何反写

Studio 从本次 Run 的实际执行闭包读取 `TemporalInstant` / `TemporalWindow` 记录和直接消费边，
再逐端点读取 authority：

- `semantic` 写回共享 Script 身份；
- `parameter` 点名作者输入，再由编译来源定位它的精确 Source 端点；
- `fixed` 禁止会改变该端点的手势。

因此 `at/for`、`until/for` 可以出现一次手势同时修改 Script 与 SVML。例如拖动 `at/for`
的起点时，Moment 会移动，同时 `for` 会改变以保持终点不动。两处修改属于同一个 revision
事务；重新编译失败时一起回退。

Companion 仍负责实体外观和 Inspector 展示，但不再声明通用时间逆函数。新组件只要消费公共
Instant/Window，并由 Companion 把真实执行谱系连到实体，就自动获得同一套时间行为。

消费端也不是只读取 `frame`：每个官方组件在接收 Instant/Window 时核对 `subjectId`、
`ProgramSpace.id` 与 `narrativeId`。为此 Space 是运行图上的显式输入边；不通过全局状态、
当前 Film 或 renderer 上下文补猜。

字幕 Cue 保持独立：`CaptionDocument -> TimedCaptionProjection -> FineCaptionSchedule` 直接从
Semantic token evidence 得到只读 Cue 时间，不伪装成可拖动的 TemporalWindow。两种投影共享
`spaceId / narrativeId / documentId` 的来源校验，但只有 Fine 的 lead、tail、handoff 作为普通
参数允许修改。

Film 与 Script 的解释也不留在 Studio 核心：`film-studio` 声明 Film 的语义轴和终端 Track
引用规则；`script-studio` 拥有 Script Source map 与 marker 移动。Studio 只选择
`narrativeId` 与当前 ProgramSpace 严格一致的 Script，再把语义修改委托回该 Companion。

这里的 binding 名不是全局地址。Markup 在降低语法时保留作者元素和输入范围，Elaborator
把端点与 Record、Component、Output 一起按 Source unit hygienize；编译结果中的
`AuthorProvenance` 再把运行 authority 精确接回这个端点。Studio 不会在多份 import 中选择
第一个同名的 `start`、output 或本地 id。这份 provenance 每次编译重新产生，不落盘，也不是
lock、哈希清单或项目索引。
