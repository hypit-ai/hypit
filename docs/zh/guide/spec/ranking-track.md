---
title: SVML Ranking Track 迁移
description: 官方 Ranking 迁移的已实现可执行权威，包含全部四个作者组件。
---

# SVML Ranking Track 迁移

状态：官方 Ranking 迁移的已实现可执行权威。四个作者组件、它们共享的触发式调度、可选的同级 AudioTrack
lowering、作者 Surface 以及真实浏览器证据都在 `@narratage/ranking` 中执行。它不是对历史 node 格式的兼容
承诺，也不是冻结的公开 ABI。

## 1. Ranking 的含义

Ranking 是一个视频领域的作者组件，它把一个有序集合呈现为渐进的视觉状态。它不是 Core 概念、不是通用的
Track 模式、不是 Provider，也不是渲染器特性。

旧系统把四种本质不同的行为塞在同一个 `ranking_track` 节点和一个 `rankingType` 开关背后。新系统使用一个
物理包 `@narratage/ranking@1`，但暴露四个互相独立的作者组件：

- `ranking:TierBoard` —— 把已揭示的条目放入具名的 tier 行；
- `ranking:Column` —— 在舞台上展示一个当前条目，然后让它落位到带编号的列中；
- `ranking:TopThree` —— 渐进揭示最多三个条目，并强调当前条目；
- `ranking:TypewriterList` —— 在常驻的纸张 / 列表表面上逐字打出有序文本行。

一个包是共享校验、调度构造、布局工具和绘制原语的正确单位。四个组件是作者语义的正确单位。不存在公开的
`rankingType`、模式选择输入、动态端口注册表或 Runtime 渲染器注册表。

第三方可以发布另一个 Ranking 包，无需在 Core 注册类型，也无需修改本包。安装并 import 该包后，它会通过
普通的模块机制贡献自己的 Surface、Type、validator 和 fragment 编译器。

## 2. 来自旧实现的证据

被审阅的旧项目清单中包含 21 个已迁移的 Ranking 节点：

| 历史变体 | 审阅到的用例数 | 观察到的条目数 |
|---|---:|---|
| Tier | 10 | 5–6 |
| Typewriter | 5 | 5 |
| Column | 3 | 4–5 |
| Top Three | 3 | 3 |

这份清单证明了四种语义都真实存在，但并不证明它们的旧表示应当延续。旧实现存在如下结构性问题：

1. 同一个 UI / node 身份通过切换模式并断开其动态端口来改变语义；
2. 同一对条目 `start/end` 在不同渲染器下分别意味着可见性、动画阶段、后继交接，或者什么也不意味着；
3. Top Three 忽略条目结束时间，而 Typewriter 只用它们的并集来判断纸张是否已挂载；
4. 渲染器检视所有兄弟片段、对其排序或计数，并在通用 Track Program 已经丢失这些语义之后又把组状态制造
   出来；
5. 一个全局 z-index 使看板与各个图标无法与同级 Track 交错；
6. 裸 URL、环境字体名、Remotion 组件 id 以及三份互为镜像的注册表把环境 / 渲染器细节泄漏进组件；
7. 过短的窗口可能悄悄压掉运动音效，而不是把视觉与声音阶段一起适配到同一份有限的共享调度中。

迁移保留的是有用的视觉能力，而不是这些偶然形成的语义。

## 3. 面向作者的形态

可执行的作者 Surface 是：

```svml
<import as="ranking" from="@narratage/ranking@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
<import as="studio" source="./studio.svs"/>

<fonts:Stack id="ranking-fonts" family="inter" weight="700" style="normal"/>

<ranking:ColumnStyle id="column-style"
  recipe={studio.ranking.column}
  font={ranking-fonts}/>

<ranking:Column id="tools"
  space={speech.space}
  map={timing.map}
  during={story.selection.ranking-board}
  triggers={story.moment.next-rank}
  terminal={story.moment.ranking-complete}
  style={column-style}>
  <ranking:ColumnItem label="Fourth" icon={fourth.image}/>
  <ranking:ColumnItem label="Third" icon={third.image}/>
  <ranking:ColumnItem label="Second" icon={second.image}/>
  <ranking:ColumnItem label="First" icon={first.image}/>
</ranking:Column>
```

`during` 提供显式的外层窗口。`triggers` 提供一个有序的 Moment occurrence 集合。`terminal` 是最后一个活动
阶段的显式终点；它可以早于外层终点，从而让完全落位后的结果继续可见。组件要求 trigger occurrence 的数量
等于子条目的数量，并按作者书写顺序一一对应。

外层 Selection 与 terminal Moment 都使用严格的 `one` 语义。trigger Moment 使用严格的 `each` 语义。外层 /
terminal 出现零次或多次、trigger 出现零次，以及任何 trigger 与条目的基数不匹配，都是编译错误；组件绝不会
自己挑一个方便的 occurrence。

这种按位置配对由这四个组件声明，不是通用的 Core 行为。另一种第三方 Surface 可以给每个条目单独的 Moment
边，并 lower 到同一套包内事实。

Style 声明与使用保持分离。SVS 提供具名的通用 Recipe 数据；每个变体专属的 `*Style` 组件拥有各自允许的
键，并把 Recipe 加上显式的字体边编译成一个带类型、由包拥有的 Style。诸如 tier 行、标签、图标和入场行为
这类语义化的条目值不是绘制属性，不属于 SVS。

## 4. 组能看到兄弟，渲染出的 Track 不能

渐进式 ranking 不能通过把每个子项当作孤立的 Track item 来编译。行位置、后继交接、活动条目状态和已落位的
前缀都依赖这个有序的组。但这不意味着条目在渲染时互相检视。

作者组件首先把完整的子项列表和 trigger 集合编译成一份包内私有的调度：

```ts
type RankingSchedule = {
  readonly outer: FrameSpan;
  readonly terminalFrame: number;
  readonly entries: readonly {
    readonly itemId: string;
    readonly triggerOccurrenceId: string;
    readonly triggerFrame: number;
    readonly stage: FrameSpan;
    readonly cumulative: FrameSpan;
  }[];
};
```

这是确定性 Operation 之间一个显式的 Graph 值，不是夹带在图像、Track 或媒体 Artifact 里的元数据。它由
Ranking 包拥有并版本化，不会加入 Core、Composition 或共享的 Track 窄腰。

```text
Moment set + SemanticMap + ProgramSpace + outer/terminal projection + ordered item ids
                                      │
                                      ▼
                              RankingSchedule
                                │          │
             Style + content ───┘          └── SFX clips + gains
                     │                              │
                     ▼                              ▼
                VisualTrack                    AudioTrack
```

调度 Operation 保留源顺序和稳定的 occurrence 身份，绝不按物理时间排序。帧量化之后它要求：

```text
outer.start <= p1 < p2 < ... < pN < terminal <= outer.end
```

任何非法或帧相等的序列都会整体失败。视觉与可选音频的 lowerer 消费同一份调度，因此运动与声音不会漂移，
同时它们仍然是 Run Graph 中可以各自独立被 demand 的分支。

## 5. 共同的阶段模型

对外层窗口 `[B, O)`、trigger `p1 ... pN` 和 terminal `T`，条目 `i` 得到：

```text
active stage       [p_i, p_(i+1))    or [p_N, T)
cumulative life    [p_i, O)
settled life       [stage.end, O)
```

`[B, p1)` 可以显示作者显式声明的空看板，但没有隐含的活动条目。`[T, O)` 是可选的完全落位后缀，没有活动
条目。这些事实是由包拥有的兄弟排序，建立在 [`track-authoring.md`](./track-authoring.md) 的共享时间投影
代数之上；它们不是一个新的 `Stage` 合同。

### TierBoard

- 看板占据 `[B, O)`；
- 每个条目从它的 trigger 起累积可见直到 `O`；
- `entry="direct"` 在 trigger 之后直接动画进入它最终的 tier 单元格；
- `entry="stage"` 在共享的 stage 点出现，在其活动阶段内停留于此，并在该阶段结束前移动到最终单元格，之后
  保持落位状态；
- 条目拥有必填的图像和 tier 行 id；行内的源顺序决定它的单元格；
- 不可能完成的出现 / 移动时长是编译错误，绝不会被悄悄缩短或省略。

### Column

- 带编号的看板占据 `[B, O)`；
- 每个活动阶段内恰好有一个条目占据大舞台；
- 该阶段结束时，这个条目成为已落位列的一部分，直到 `O`；
- 标签必填，图像可选，名次即作者书写的条目顺序；
- 在一份合法的调度之后，当前条目重叠在结构上不可能发生。

### TopThree

- 最多接受三个条目；
- 每个条目从它的 trigger 起累积揭示直到 `O`；
- 只有对应当前活动阶段的条目会得到活动光环 / 强调运动；
- `[T, O)` 展示所有已揭示条目且没有活动强调；
- 标签必填，图像可选，槽位即作者书写的条目顺序。

### TypewriterList

- 纸张占据 `[B, O)`，空白行可以在其 trigger 之前就在结构上预留；
- 第 `i` 行在 `p_i` 开始打字，并保持可见直到 `O`；
- 打字时长由 Unicode 字素簇数量和 Style 的速度确定性地推导；
- 打字以及可选的获胜标记必须放得进该条目的活动阶段，否则编译失败；
- 标题、可选的显式强调区间和各行字符串都是作者内容，不是 LLM 字段。

Typewriter 之所以留在 Ranking 包里，是因为尽管它大量使用文本排版，它的作者语义仍然是一个有序的渐进
ranking。它可以与未来的 Text 实现共享底层的精确字体 / 排版工具，但不得依赖通用 Text Track Program，也不得
冒充成它。

## 6. 空间布局与 stacking

每个组件拥有一个外层放置框和它自己的内部布局算法。Tier 单元格、Column 行或 Top Three 槽位不是通用的
逐条目空间定位器。允许在这些子项上传入任意空间输入会摧毁组件的语义。

放置与 stacking 保持独立：

- 外层框决定看板、舞台和条目的坐标系；
- Style 解析出看板的绝对 stack 顺序，以及舞台 / 条目的默认值；
- 每个子项都可以显式覆盖自己的绝对条目 stack 顺序；
- 在需要独立交错时，看板、舞台装饰和每个条目会 lower 成各自独立的 `VisualPresent` 值；
- 产出的那一个 `VisualTrack` 不是 stacking context，因此同级 Track 的 Present 可以出现在看板与任意图标
  之间。

任何包都不应仅仅为了获得多个 z 位置而发出多个 Track。稳定的 `tieBreak` 值来自作者声明的组件 / 条目身份，
绝不来自求值顺序。

所有归一化几何都相对于显式的外层框。各变体必需的尺寸参数包括：

- Tier：行定义 / 颜色、看板与标签宽度、stage 点、单元格间距、图标 fit / 圆角以及出现 / 移动时长；
- Column：看板框、行高 / 行距、stage 点与尺寸、单元格 / 图标几何、名次配色以及出现 / 移动时长；
- Top Three：中心 / 宽度、标签行、图标尺寸、光环宽度 / 配色以及揭示 / 强调运动；
- Typewriter：纸张主题 / 绘制、内边距、行距、标题 / 条目排印、旋转、打字速度以及获胜标记的绘制 / 运动。

绘制、几何和运动参数由拥有它们的 `*Style` 组件校验。未知的 Recipe 属性一律失败。不存在任意的 CSS 逃生
出口。

## 7. 媒体、字体与声音

图像和声音通过显式的 `BlobArtifact` 边进入。字体通过显式的、内容寻址的字体栈边进入。Ranking 绝不存储
URL、不要求 Runtime 挑选字体，也不指名某个渲染器组件。

可选音效是普通的作者输入：

- 出现音在条目的 trigger 处开始；
- 移动音来自视觉 lowerer 所用的同一段已调度的移动阶段；
- 增益与素材选择位于 Style / 显式声音输入中；
- 配置了声音就产出同级的 `AudioTrack`；没有声音就不产生被 demand 的音频分支；
- 声音播放绝不进入 Hyperframes 或某个视觉 Track。

Ranking 自身是确定性的，没有 Need、Provider、队列、凭据或环境适配器。如果输入图像是生成出来的，那次上游
生成仍然是另一个 Graph 组件。

## 8. Run Graph 行为

作者图导出普通的逻辑 `visual` 结果，以及在作者声明时导出 `audio` 结果。Target、Candidate 和替换受与其他
所有组件相同的 Run Graph 法则约束。Ranking 不新增任何缓存、pin 或预览原语。

替换视觉结果不会改动音频结果。通过普通的显式输出映射，也可以用一个多输出 Candidate 同时替换两个输出。
一旦每个被 demand 的原始输出都由选定的 Candidate 满足，demand 分析就会剪掉原来的 Ranking 分支及其时间 /
媒体祖先。不需要任何特殊的 Ranking 执行规则。

## 9. 迁移顺序与验收

按以下顺序实现：

1. **已实现：** 共享的时间投影与触发式调度法则；
2. **已实现：** `@narratage/ranking@1`，包含四个相互独立的 Program / Style 和一个私有调度工具；
3. **已实现：** TierBoard 与 Column，两者共同证明累积语义、独占舞台语义以及独立 stacking；
4. **已实现：** TopThree；
5. **已实现：** 使用精确字体 / 排版原语的 TypewriterList；
6. **已实现：** 从同一份调度产出可选的 AudioTrack lowering；
7. **已实现：** 真实浏览器的渐进状态见证，以及每个组件一份作者 Surface 图检查。

验收要求：

- trigger 与条目基数、稳定身份以及所有边界失败都有测试覆盖；
- `T < O` 在画面上可见地证明存在最终的落位后缀；
- 短阶段在不改变阶段边界的前提下确定性地容纳其局部动画与声音阶段；极短的 Typewriter 阶段可以在同一帧
  揭示多个字素簇；
- 看板与逐条目 Present 能在互不相关的绝对 z 位置上与同级 Track 交错；
- 视觉与声音的事件帧完全一致；
- 只有声明图像可选的变体才允许缺失可选图像；
- 字体与媒体都是内容寻址的依赖；
- 每个组件都能在不改动 Core、Runtime、Composition、Hyperframes 或另一个 Ranking 组件的情况下修改自己的
  Program；
- 安装第五个组件包不需要改动任何中心家族注册表。

本次迁移有意不保留历史 node JSON、模式切换、旧的动态端口、渲染器 id 或 Remotion 组件。历史项目是证据和
视觉参考，不是一门尚未发布的语言的兼容义务。

包的测试矩阵覆盖上述每一条验收项。可选启用的 Chromium 见证会用单 worker 与分区 worker 分别求值全部四个
组件，证明可见的 trigger 推进和最终的落位后缀，并且只对跨进程边缘抗锯齿的微观噪声设定容差。逻辑帧状态、
几何、stacking、事件帧和作者声明的图边都保持精确。
