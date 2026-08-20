---
title: 轨道
description: 对等 Track 组件——字幕、媒体、排版与作者声明的音频。
---

# 轨道

每个进入最终合成的视听内容都是一个对等的 **Track**。Track 是扁平的（无嵌套）；视觉层的
z 轴顺序由 SVS 中的 `stack-order` 属性决定。本页介绍 Caption、Media、Typography 与 Audio
Track 的作者语法。

## 字幕系统

字幕由一套很小的公共语言与可替换的样式族组成：

```text
Script 显示全集 → Caption Program → Planner + Atom 实测时间 → 样式族 Track
```

```svml
<import as="caption" from="@hypit/caption@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>
<import as="caption-ai" from="@hypit/caption-gemini@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="fonts" from="@hypit/fonts-open@1"/>
```

公共 Caption 只负责 Cue 字数边界、可选的通用逐词字段、完整样式分配、Plan 校验与时间拼接。Fine 是第一种无字段样式族，负责自己的几何、字形/Cue/Pill Paint 与局部动画。

### caption-fine:Style

一个 Style 是不可拆分的“规划要求 + 渲染参数”。Fine 从一个包自有的 SVS Recipe
同时解析两者：

```svs
caption.primary {
  cue-min-words: 2; cue-max-words: 7;
  stack-order: 70; x: 0.5; y: 0.88; width: 0.84;
  anchor-x: center; anchor-y: bottom;
  size: 58; line-height: 1; align: center;
  fill: #FFFFFF; stroke-color: #09090B; stroke-width: 2;
  background: #00000000; padding: 0; radius: 0;
  karaoke: trail; karaoke-transition: wipe; active-fill: #FFD54A;
  active-box: current; active-box-continuity: isolated;
  active-box-background: #FFD54ACC; active-box-padding: 4 8; active-box-radius: 8;
  active-underline: current; active-underline-color: #FFFFFF;
  cue-enter: spring; cue-enter-frames: 6;
  active-response: pop; active-response-frames: 5; active-scale: 1.08;
}
```

```svml
<fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
</fonts:Stack>
<caption-fine:Style id="primary-caption" recipe={recipes.caption.primary}
  font={caption-fonts}/>
```

必填的 `font=` 边携带一个按字节复现的 `FontStackRef`。字体家族、字重和字形只在这条边上声明一次；每个 Fallback 保留自己的真实字体信息。省略字体栈会在编译时失败，不会退回当前机器上的同名字体。

Recipe 同时包含 `cue-min-words`、`cue-max-words` 和完整字号/外观/框参数。Fine 不声明任何逐词字段；其他字幕包可以定义完全不同的字段和渲染方式，无需修改公共 Caption。

Fine 不是一组互斥预设。基础/激活渐变、描边、阴影、长阴影、外发光、下划线、Pill
和动画均为正交维度。文字、下划线和 Pill 各自选择 `off | current | trail`；因此可以直接表达“文字保留已读色，但 Pill 只跟随当前词”。`active-box-continuity: joined` 会把已读前缀在每个真实换行片段内连成一个背景，而不是给每个词分别套胶囊。

Fine 只在完整 Atom 之间自然换行，永不裁掉作者文字，因此有意不提供 `max-lines`。需要控制行数时，应调整 Cue 字数边界、Track 宽度与字号。

CJK 口播可以直接书写。若一个只负责显示的 emoji 仍需跟随语音计时，应显式写出对应，例如 `<🌐 | globe>`；系统不会替裸符号虚构一个口播词。

### caption:Program

Program 消费 Script 显式输出的完整有序显示词全集。一个必填的默认 Style 自动覆盖所有词，不需要作者制造 `@whole` 或补集。`Use` 按源码顺序替换整个 Style，后命中者获胜。

```svml
<caption:Program id="caption-program" display={story.caption}
  default={primary-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
  <caption:Use words={story.caption.selection.product-demo}
    style={dialogue-caption}/>
  <caption:Mute words={story.caption.selection.private}/>
</caption:Program>
```

`role=` 是词子集查询的作者语法，不是时间条件。`words=` 接收 Selection 的字幕专用词投影；通用 Selection 的公开值仍只有语义首尾锚点。
`Mute` 消费同一份精确词投影，不进入 Gemini；它在 Cue 规划完成后隐藏这些完整 Atom，既不重新分 Cue，也不把字幕可见性变成 Core 的通用时间遮罩。

### caption-ai:Planner

```svml
<caption-ai:Planner id="caption-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
```

Planner 只接收不可改写的显示 Atom/Word 与已解析好的 Style runs。它只能在完整 Atom
之间分 Cue，并给 Word id 附上样式声明的字段；Fine 没有字段。它看不到音频、时间或
Dual Text 右侧。

### caption-fine:Track

```svml
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} semantic={speech.semantic} program={caption-program} plan={caption-plan.plan}/>
```

公共 Caption 先把 Plan 与独立 SemanticMap 拼接，Fine 再把所有默认/覆盖样式渲染成一个普通的对等 `VisualTrack`：`{captions.track}`。

## Media 叠加层与 B-roll

B-roll 是通用 Media Track 的一种剪辑用途，不是独立 Track 家族。一个 Item 可以在语义或绝对窗口内放置图片、生成视频、已规范化含时素材或 Compositable Surface。

```svml
<import as="media-track" from="@hypit/media-track@1"/>
<import as="wording" from="@hypit/text@1"/>
```

### media-track:Track 与 media-track:Item

位置是一条显式 Spatial Frame 边，外观和运动则是可复用的 SVS 值：

```svml
<wording:Value id="product-direction">
  A clean vertical product film: the written script becomes semantic regions,
  then those regions assemble into a finished video.
</wording:Value>

<seedance:ReferenceVideo id="product-motion" model="mini"
  prompt={product-direction} duration="5">
  <seedance:Reference image={product-reference}/>
</seedance:ReferenceVideo>

<space:Frame id="product-frame" within={vertical}
  left="8%" top="20%" right="92%" bottom="68%"/>

<media-track:Track id="product-broll" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item video={product-motion.video} frame={product-frame}
    during={story.selection.product-demo}
    appearance={recipes.media.product}
    motion={recipes.motion.product}/>
</media-track:Track>
```

`left`、`top`、`right`、`bottom` 是父 Frame 内的边坐标；`right` 和 `bottom` 不是 CSS 式外边距。Selection 只贡献语义点；Media 包负责将这些点投影为窗口。同一个 Item 模型也能表达全屏切换、分屏和角落小窗。需要多个素材时，可以使用有序局部 Layer 或显式 Sequence。

每个 Item、Member 或采样 Layer 都必须且只能声明一种视觉输入形式：

| 输入 | 值 | 含义 |
|---|---|---|
| `image={...}` + `extent={...}` | Blob + 作者声明的像素尺寸 | 没有自带时长的静态图 |
| `video={...}` | 生成/原始视频 Blob | 自动检查、选流并按本 Track 的 `space` 规范化 |
| `media={...}` | `SynchronizedMedia` | 直接连接显式准备好的含时素材 |
| `surface={...}` | `CompositableSurfaceRef` | 直接连接带透明度语义的静态或含时 Surface |

原始 `video=` 默认只取画面；需要它自己的声音时添加 `audio="include"`，并可继续用
`audio-gain` 调节所选源音频。输入名必须显式，是为了绝不靠猜测把一个通用 Blob 当成图片或视频。简洁语法没有绕过图：`video=` 会展开为普通的绑定请求、检查、选流、规范化
Operation。需要共享或特殊选流时仍可显式写 `<pipeline:Normalize>`，再把结果用 `media=` 接入。

**输出：**`{product-broll.visual}`；只有作者显式选择了源音频或 SFX 时才会出现
`{product-broll.audio}`。

## Audio Track

`@hypit/audio-track` 把显式准备好的音频放进与视觉 Track 相同的 ProgramSpace。`Clip`
消费 `SynchronizedMedia`；先规范化已声明或生成的音频 Blob，再选择精确节目窗口与占用方式：

```svml
<import as="media" from="@hypit/media@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="audio" from="@hypit/audio-track@1"/>

<media:Audio id="music" src="./assets/music.wav"/>
<pipeline:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>

<audio:Track id="music-bed" semantic={speech.semantic}>
  <audio:Clip source={music-media.media} during="program"
    playback="loop-end" gain="0.28" fade-in="600ms" fade-out="800ms"/>
</audio:Track>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `Track.id` | 是 | 稳定的 Audio Track 身份 |
| `Track.semantic` | 是 | 定义精确采样域与帧域的 SemanticTrack |
| `Clip.source` | 是 | 显式选流并规范化后的 `SynchronizedMedia` |
| `during`、`at`/`for` 或 `start`/`end` | 三种形式选一 | 全节目、Selection、Moment 或显式窗口 |
| `playback` | 否 | `once`、`once-end`、`loop`、`loop-end` 或有界 `stretch` |
| `occurrences` | 否 | 语义来源有多次出现时选择 `one` 或 `each` |
| `trim-start`、`trim-end` | 否 | 精确源裁切 |
| `gain`、`fade-in`、`fade-out` | 否 | 显式的单 Clip 混音值 |

该包不会自动提取、规范化、duck 或分配 bus。同一 Track 内的多个 Clip 与多个对等 Audio
Track 都会作为独立输入进入 Film。输出 `{music-bed.track}` 是普通 `AudioTrack`。

## 文字叠加层

在屏幕上显示的静态或定时文字——标题、标注、下方三分之一字幕条。

```svml
<import as="text" from="@hypit/typography-track@1"/>
<import as="wording" from="@hypit/text@1"/>
```

### text:Track

文字项目的容器。

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="94%" bottom="16%"/>
<fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
<text:Track id="titles" semantic={speech.semantic}>
  <text:Area id="title" placement={title-frame} style={title-style} during="program">
    EDIT MEANING, NOT TIMELINES
  </text:Area>
</text:Track>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `semantic` | 是 | 来自 `speech:Track` 的 SemanticTrack——也用于解析基于 Selection 的项目计时 |

### text:Point、text:Area 与 text:Path

每个 Item 都明确选择一种放置形式、一份精确 Style 和一种时间投影。`Area` 把流式文字放入
`SpatialFrame`：

```svml
<text:Area id="meaning" placement={title-frame} style={title-style} during="program">
  MEANING
</text:Area>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 稳定的 Item 身份 |
| 子内容或 `content` | 是 | 内联纯文本/富文本，或普通图 `Text` 引用；两种形式互斥 |
| `during` | 是 | `"program"` 或 Selection 引用；也可使用 `at` 与显式 `start`/`end` |
| `placement` | 是 | 与 Item 形式匹配的 `SpatialPoint`、`SpatialFrame` 或 `SpatialPath` |
| `style` | 是 | 由 SVS Recipe 与精确字体字节共同编译出的 `text:Style` |

`during` 属性接受字面字符串 `"program"`（表示完整 ProgramSpace），或用于语义计时的 Selection 引用：

```svml
<text:Style id="callout-style" recipe={recipes.text.callout} font={title-font}/>
<text:Track id="callout" semantic={speech.semantic}>
  <text:Area id="callout-copy" placement={callout-frame}
    style={callout-style} during={story.selection.callout}>
    EXACTLY THE RIGHT MOMENT
  </text:Area>
</text:Track>
```

图中产生的文字会保留为显式边：

```svml
<wording:Value id="headline">EXACTLY THE RIGHT MOMENT</wording:Value>
<text:Track id="callout" semantic={speech.semantic}>
  <text:Area id="callout-copy" content={headline}
    placement={callout-frame} style={callout-style} during="program"/>
</text:Track>
```

通用 `Text` 只提供字符；Typography 仍然拥有文档包装、位置、时间、样式与动画。作者需要富文本
Run 时，继续使用内联 `P`/`Span`/`Break`。

**输出：**`{titles.track}` —— 添加到 `film:Film` 的 VisualTrack。

## 榜单板

榜单板让一份有序列表跟着 Script 动起来：在某个 Selection 期间出现，在 Moment 上移动，在另一个 Moment 上定格。三个变体共用同一套形状——一个容器、它专属的条目标签、以及它专属的样式标签。

| 容器 | 条目 | 样式 |
|---|---|---|
| `ranking:TierBoard` | `ranking:TierItem` | `ranking:TierBoardStyle` |
| `ranking:Column` | `ranking:ColumnItem` | `ranking:ColumnStyle` |
| `ranking:TopThree` | `ranking:TopThreeItem` | `ranking:TopThreeStyle` |

```svml
<import as="ranking" from="@hypit/ranking@1"/>
```

### 样式标签

标签必须为空，三个属性全部必填：`id`、`recipe`（一份 SVS Recipe）与 `font`（Font Stack 或字体产物）。Recipe 承载这块板自己的键——行、配色、动效——并且会按变体校验，把 Column 的 recipe 给 TierBoard 会被指名拒绝。

### 容器标签

| 属性 | 取值 |
|---|---|
| `semantic` | 板据以计时的 SemanticTrack |
| `frame` | 一个 `space:Frame`——对 `Column` 来说是固定的排名轨 |
| `during` | 一个 Selection——板在此期间留在画面上 |
| `style` | 对应的样式记录，且只接受本变体的 |
| `triggers`、`terminal` | 两个 Moment——行在前者上移动，板在后者上定格。仅 `TierBoard` 与 `TopThree` |
| `canvas` | 一个 `space:Canvas`——揭示舞台。仅 `Column` |
| `appear-sound`、`move-sound` | 可选，Synchronized Media |

`move-sound` 在 `TopThree` 上会被拒绝——它没有移动阶段。在 `TierBoard` 上它要求至少有一个 `entry="stage"` 的条目：声音没有可响之处是创作错误，而不是静默的空操作。

### 条目标签

每个变体只接受自己的那一种，至少一个，且 id 在同一块板内不可重复。

- **`TierItem`** —— `tier`（必填，须与 recipe 中某一行的 id 对上）、`icon`（必填），可选 `entry="direct" | "stage"` 与 `stack`。行的文字来自 recipe，不写在标签上。
- **`ColumnItem`** 与 **`TopThreeItem`** —— `label`（必填：字符串或 Text 引用），可选 `icon` 与 `stack`。`TopThree` 最多三条。

```svml
<ranking:ColumnStyle id="board-style" recipe={recipes.ranking.board} font={ui-font}/>
<ranking:Column id="board" semantic={speech.semantic} frame={board-frame}
  during={story.selection.board} triggers={story.moment.place} terminal={story.moment.done}
  style={board-style}>
  <ranking:ColumnItem id="row-regen" label="ReGen" icon={icon-regen}/>
  <ranking:ColumnItem id="row-chatgpt" label="ChatGPT" icon={icon-chatgpt}/>
  <ranking:ColumnItem id="row-remini" label="Remini" icon={icon-remini}/>
</ranking:Column>
```

**输出：** `{board.visual}`——一条 VisualTrack。带了声音的板还会导出 `{board.audio}`，一条 AudioTrack；没有声音时就没有这个输出。

## 卡片堆

卡片堆按深度排布卡片：一张在最前，其余向后退去，每张新卡在一个 Moment 上发出。Media Item 是把一个镜头放进一个 Frame，而卡片堆是在同一个 Frame 里维持一叠并整体移动它们。

```svml
<import as="deck" from="@hypit/deck-track@1"/>
```

### deck:DepthStack

`id`、`semantic`、`canvas`、`frame` 与 `appearance` 全部必填，`until` 同样必填——它说明什么结束这叠卡片：字面量 `"program.end"`、一个 Moment，或一个 Selection。只有在指向 Selection 时才可以再加 `until-boundary="start" | "end"` 来选择用它的哪一端结束，默认是 `end`；在另外两种情况下给出这个属性会被拒绝，而不是被忽略。

### deck:Card

DepthStack 的直接子元素，自闭合，至少一张，按书写顺序发出。

| 属性 | 取值 |
|---|---|
| `source` | 必填——静态图片、Synchronized Medium 或 Compositable Surface |
| `extent` | 静态图片必填，其余情况给了会被拒绝 |
| `at` | 必填——这张卡发出的 Moment |
| `appearance` | 可选——它自己的 Recipe，否则沿用整叠的 |
| `label` | 可选——一条 `deck:Label` 记录 |

### deck:Label

`id` 与 `font` 必填。文案来自 `content=` 引用或元素自身的文字，两个都给会被拒绝。`size`、`color`、`align`、`block`、`padding` 可选。

```svml
<space:Frame id="deck-frame" within={vertical} left="44%" top="60%" right="98%" bottom="88%"/>
<deck:DepthStack id="deck" semantic={speech.semantic} canvas={vertical}
  frame={deck-frame} appearance={recipes.deck.stack} until={story.moment.done}>
  <deck:Card id="card-spatial" source={icon-spatial} extent={square} at={story.moment.deal-one}/>
  <deck:Card id="card-type" source={icon-type} extent={square} at={story.moment.deal-two}/>
</deck:DepthStack>
```

**输出：** `{deck.track}`——一条 VisualTrack，与 Film 中其它每一条 Track 平级。

## 屏幕叠加层

覆盖在整个画面之上、而非落在某个 Frame 里的效果：切点上的一次闪白、持续整个 Selection 的暗角、铺满全片的颗粒。一条 Track 承载全部，每个子元素是一个效果加它自己的时间窗。

```svml
<import as="screen" from="@hypit/screen-overlay@1"/>
```

`screen:Track` 接受 `id`、`canvas` 与 `space`。它的子元素就是各个效果，至少一个，各自为空，都必须带 `z` 决定层叠顺序，并且各有一个时间窗，形式是以下之一：

| 时间窗 | 写法 |
|---|---|
| 整个节目 | `during="program"` |
| 一个 Selection | 在带有 `semantic={speech.semantic}` 的 Track 内写 `during={story.selection.x}` |
| 一个 Moment，持续一段时长 | 在带有 `semantic={speech.semantic}` 的 Track 内写 `at={story.moment.x} for="12f"` |
| 显式区间 | `start="…" end="…"`，可另外指定 `selection=` 或 `moment=` |

Track 接受 `id`、`canvas` 与 `semantic`。时长写作 `12f`、`250ms` 或 `1.5s`，`occurrences="each"` 让效果在标记的每一次出现处重复，而不只是第一次。

可用的效果有十一种——`Flash`、`ColorWash`、`Vignette`、`ScanLines`、`DirectionalMatte`、`WhipVeil`、`GlitchVeil`、`Grain`、`LightLeak`、`Bokeh` 与 `TVStatic`——每种各有自己的必填属性，例如 `Flash` 的 `color` / `intensity` / `attack` / `hold` / `decay`，或 `Vignette` 的 `center-x` / `center-y` / `radius-x` / `radius-y` / `softness` / `color` / `opacity`。它们都没有默认值：一个效果要么把自己的形状说全，要么被拒绝。

```svml
<screen:Track id="effects" semantic={speech.semantic} canvas={vertical}>
  <screen:Flash during={story.selection.overlay} z="80"
    color="#ffffff" intensity="0.6" attack="2" hold="2" decay="6"/>
</screen:Track>
```

**输出：** `{effects.track}`——一条 VisualTrack。

## 评论贴纸

放置在 Frame 中的社交风格评论卡：头像、作者、评论正文，以及可选的一行附注。

```svml
<import as="comment" from="@hypit/comment-sticker@1"/>
```

`comment:Style` 必须为空，接受 `id`、`recipe` 与 `font`，全部必填。Recipe 承载整张卡的外观——背景、描边、圆角、气泡尾、头像、三行文字，以及进入/停留/退出的动效——每个键都有默认值，所以一份 recipe 只需写它要改的部分。

`comment:Track` 接受 `id`、`canvas` 与 `semantic`，三者皆为必填。

`comment:Sticker` 必填 `id`、`frame` 与 `style`，时间窗与上面的屏幕叠加层相同。它的文案来自 `comment=` 属性或元素自身的文字，两个都给会被拒绝。可选的 `author`、`header` 与 `meta` 各接受字符串或 Text 引用，`avatar` 接受一张图片；这里没有 `z`，层叠顺序来自 recipe 的 `stack-order`。

```svml
<comment:Style id="social" recipe={recipes.comment} font={ui-font}/>
<comment:Track id="comments" canvas={vertical} semantic={speech.semantic}>
  <comment:Sticker id="one" frame={comment-frame} style={social} avatar={viewer-avatar}
    author="@viewer" meta="Featured" during={story.selection.reaction}>
    原来它把字幕钉在词上，而不是钉在秒上。
  </comment:Sticker>
</comment:Track>
```

**输出：** `{comments.track}`——一条 VisualTrack。

## 组合示例

四类 Track 在一个源文件中协同使用：

```svml
<import as="caption" from="@hypit/caption@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>
<import as="caption-ai" from="@hypit/caption-gemini@1"/>
<import as="fonts" from="@hypit/fonts-open@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="media-track" from="@hypit/media-track@1"/>
<import as="text" from="@hypit/typography-track@1"/>
<import as="audio" from="@hypit/audio-track@1"/>
<import as="space" from="@hypit/spatial@1"/>

<!-- Captions: primary style for all text -->
<fonts:Stack id="caption-font" family="inter" weight="700" style="normal"/>
<fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
<caption-fine:Style id="base-caption" recipe={recipes.caption.base} font={caption-font}/>
<caption:Program id="caption-program" display={story.caption} default={base-caption}/>
<caption-ai:Planner id="cue-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} semantic={speech.semantic} plan={cue-plan.plan} program={caption-program}/>

<!-- 共享位置是显式边，与 Media/Text 外观分开。 -->
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="94%" bottom="16%"/>
<space:Frame id="card-frame" within={vertical}
  left="10%" top="20%" right="90%" bottom="70%"/>

<!-- Media：Selection 期间显示一个普通 Item -->
<media-track:Track id="cards" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item video={motion.video} frame={card-frame}
    during={story.selection.demo} appearance={recipes.media.card} motion={recipes.motion.card}/>
</media-track:Track>

<!-- Text: persistent title overlay -->
<text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
<text:Track id="titles" semantic={speech.semantic}>
  <text:Area id="meaning" placement={title-frame} style={title-style} during="program">
    MEANING
  </text:Area>
</text:Track>

<!-- Audio：先规范化一份已声明素材，再把它放满整个节目 -->
<media:Audio id="music" src="./assets/music.wav"/>
<pipeline:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>
<audio:Track id="music-bed" semantic={speech.semantic}>
  <audio:Clip source={music-media.media} during="program"
    playback="loop-end" gain="0.28" fade-in="600ms" fade-out="800ms"/>
</audio:Track>

<!-- 所有对等 Track 都进入 Film -->
<film:Film id="main" canvas={vertical} semantic={speech.semantic} appearance={recipes.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audio}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
  <film:Track source={titles.track}/>
  <film:Track source={music-bed.track}/>
</film:Film>
```

每个 SVS Recipe 中的 `stack-order` 决定 z 轴排序：语音视觉层为 10，Media 为 40，字幕为 70，文字为 90。数值越高，渲染层越靠上。
