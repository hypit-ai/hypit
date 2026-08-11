---
title: 字幕、Media、Typography 与 Audio
description: 对等 Track 组件——字幕、媒体、排版与作者声明的音频。
---

# 字幕、Media、Typography 与 Audio

> **发布前说明：** Caption Fine、Media Track、Typography Track 与 Audio Track 都执行各自声明的作者 Surface。
> 它们的作者 API 仍可演进；共享终端 Track/Visual IR 窄腰已在仓库内冻结，但尚未作为
> npm ABI 发布。

每个进入最终合成的视听内容都是一个对等的 **Track**。Track 是扁平的（无嵌套）；视觉层的
z 轴顺序由 SVS 中的 `stack-order` 属性决定。本页介绍 Caption、Media、Typography 与 Audio
Track 的作者语法。

## 字幕系统

字幕由一套很小的公共语言与可替换的样式族组成：

```text
Script 显示全集 → Caption Program → Planner + Atom 实测时间 → 样式族 Track
```

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="media" from="@narratage/media@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
```

公共 Caption 只负责 Cue 字数边界、可选的通用逐词字段、完整样式分配、Plan 校验与时间
拼接。Fine 是第一种无字段样式族，负责自己的几何、字形/Cue/Pill Paint 与局部动画。

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
<caption-fine:Style id="primary-caption" recipe={studio.caption.primary}
  font={caption-fonts}/>
```

必填的 `font=` 边携带一个按字节复现的 `FontStackRef`。字体家族、字重和字形只在这条
边上声明一次；每个 Fallback 保留自己的真实字体信息。省略字体栈会在编译时
失败，不会退回当前机器上的同名字体。

Recipe 同时包含 `cue-min-words`、`cue-max-words` 和完整字号/外观/框参数。Fine 不声明任何
逐词字段；其他字幕包可以定义完全不同的字段和渲染方式，无需修改公共 Caption。

Fine 不是一组互斥预设。基础/激活渐变、描边、阴影、长阴影、外发光、下划线、Pill
和动画均为正交维度。文字、下划线和 Pill 各自选择 `off | current | trail`；因此可以
直接表达“文字保留已读色，但 Pill 只跟随当前词”。`active-box-continuity: joined` 会把
已读前缀在每个真实换行片段内连成一个背景，而不是给每个词分别套胶囊。

Fine 只在完整 Atom 之间自然换行，永不裁掉作者文字，因此有意不提供 `max-lines`。
需要控制行数时，应调整 Cue 字数边界、Track 宽度与字号。

CJK 口播可以直接书写。若一个只负责显示的 emoji 仍需跟随语音计时，应显式写出对应，
例如 `<🌐 | globe>`；系统不会替裸符号虚构一个口播词。

### caption:Program

Program 消费 Script 显式输出的完整有序显示词全集。一个必填的默认 Style 自动覆盖
所有词，不需要作者制造 `@whole` 或补集。`Use` 按源码顺序替换整个 Style，后命中
者获胜。

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

`role=` 是词子集查询的作者语法，不是时间条件。`words=` 接收 Selection 的字幕专用
词投影；通用 Selection 的公开值仍只有语义首尾锚点。
`Mute` 消费同一份精确词投影，不进入 Gemini；它在 Cue 规划完成后隐藏这些完整 Atom，
既不重新分 Cue，也不把字幕可见性变成 Core 的通用时间遮罩。

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
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

公共 Caption 先把 Plan 与独立 SemanticMap 拼接，Fine 再把所有默认/覆盖样式渲染成
一个普通的对等 `VisualTrack`：`{captions.track}`。

## Media 叠加层与 B-roll

B-roll 是通用 Media Track 的一种剪辑用途，不是独立 Track 家族。一个 Item 可以在语义
或绝对窗口内放置图片、生成视频、已规范化含时素材或 Compositable Surface。

```svml
<import as="media-track" from="@narratage/media-track@1"/>
<import as="wording" from="@narratage/text@1"/>
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
  left="8%" top="20%" right="8%" bottom="32%"/>

<media-track:Track id="product-broll" map={timing.map}
  space={speech.space} canvas={vertical}>
  <media-track:Item video={product-motion.video} frame={product-frame}
    during={story.selection.product-demo}
    appearance={studio.media.product}
    motion={studio.motion.product}/>
</media-track:Track>
```

Selection 只贡献语义点；Media 包负责将这些点投影为窗口。同一个 Item 模型也能表达全屏
切换、分屏和角落小窗。需要多个素材时，可以使用有序局部 Layer 或显式 Sequence。

每个 Item、Member 或采样 Layer 都必须且只能声明一种视觉输入形式：

| 输入 | 值 | 含义 |
|---|---|---|
| `image={...}` + `extent={...}` | Blob + 作者声明的像素尺寸 | 没有自带时长的静态图 |
| `video={...}` | 生成/原始视频 Blob | 自动检查、选流并按本 Track 的 `space` 规范化 |
| `media={...}` | `SynchronizedMedia` | 直接连接显式准备好的含时素材 |
| `surface={...}` | `CompositableSurfaceRef` | 直接连接带透明度语义的静态或含时 Surface |

原始 `video=` 默认只取画面；需要它自己的声音时添加 `audio="include"`，并可继续用
`audio-gain` 调节所选源音频。输入名必须显式，是为了绝不靠猜测把一个通用 Blob 当成图片
或视频。简洁语法没有绕过图：`video=` 会展开为普通的绑定请求、检查、选流、规范化
Operation。需要共享或特殊选流时仍可显式写 `<pipeline:Normalize>`，再把结果用 `media=` 接入。

**输出：**`{product-broll.visual}`；只有作者显式选择了源音频或 SFX 时才会出现
`{product-broll.audio}`。

## Audio Track

`@narratage/audio-track` 把显式准备好的音频放进与视觉 Track 相同的 ProgramSpace。`Clip`
消费 `SynchronizedMedia`；先规范化已声明或生成的音频 Blob，再选择精确节目窗口与占用方式：

```svml
<import as="media" from="@narratage/media@1"/>
<import as="pipeline" from="@narratage/media-pipeline@1"/>
<import as="audio" from="@narratage/audio-track@1"/>

<media:Audio id="music" src="./assets/music.wav"/>
<pipeline:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>

<audio:Track id="music-bed" space={speech.space}>
  <audio:Clip source={music-media.media} during="program"
    playback="loop-end" gain="0.28" fade-in="600ms" fade-out="800ms"/>
</audio:Track>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `Track.id` | 是 | 稳定的 Audio Track 身份 |
| `Track.space` | 是 | 定义精确采样域与帧域的 ProgramSpace |
| `Clip.source` | 是 | 显式选流并规范化后的 `SynchronizedMedia` |
| `during`、`at`/`for` 或 `start`/`end` | 三种形式选一 | 全节目、Selection、Moment 或显式窗口 |
| `map` | Selection/Moment 必填 | 用于解析语义时间的 SemanticMap |
| `playback` | 否 | `once`、`once-end`、`loop`、`loop-end` 或有界 `stretch` |
| `occurrences` | 否 | 语义来源有多次出现时选择 `one` 或 `each` |
| `trim-start`、`trim-end` | 否 | 精确源裁切 |
| `gain`、`fade-in`、`fade-out` | 否 | 显式的单 Clip 混音值 |

该包不会自动提取、规范化、duck 或分配 bus。同一 Track 内的多个 Clip 与多个对等 Audio
Track 都会作为独立输入进入 Film。输出 `{music-bed.track}` 是普通 `AudioTrack`。

## 文字叠加层

在屏幕上显示的静态或定时文字——标题、标注、下方三分之一字幕条。

```svml
<import as="text" from="@narratage/typography-track@1"/>
<import as="wording" from="@narratage/text@1"/>
```

### text:Track

文字项目的容器。

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="6%" bottom="84%"/>
<fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={studio.text.title} font={title-font}/>
<text:Track id="titles" space={speech.space}>
  <text:Area id="title" placement={title-frame} style={title-style} during="program">
    EDIT MEANING, NOT TIMELINES
  </text:Area>
</text:Track>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `space` | 是 | 来自 `speech:Spine` 的 ProgramSpace |
| `map` | 否 | SemanticMap——当项目使用基于 Selection 的计时时需要 |

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
<text:Style id="callout-style" recipe={studio.text.callout} font={title-font}/>
<text:Track id="callout" space={speech.space} map={timing.map}>
  <text:Area id="callout-copy" placement={callout-frame}
    style={callout-style} during={story.selection.callout}>
    EXACTLY THE RIGHT MOMENT
  </text:Area>
</text:Track>
```

图中产生的文字会保留为显式边：

```svml
<wording:Value id="headline">EXACTLY THE RIGHT MOMENT</wording:Value>
<text:Track id="callout" space={speech.space}>
  <text:Area id="callout-copy" content={headline}
    placement={callout-frame} style={callout-style} during="program"/>
</text:Track>
```

通用 `Text` 只提供字符；Typography 仍然拥有文档包装、位置、时间、样式与动画。作者需要富文本
Run 时，继续使用内联 `P`/`Span`/`Break`。

**输出：**`{titles.track}` —— 添加到 `film:Film` 的 VisualTrack。

## 组合示例

四类 Track 在一个源文件中协同使用：

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
<import as="media" from="@narratage/media@1"/>
<import as="pipeline" from="@narratage/media-pipeline@1"/>
<import as="media-track" from="@narratage/media-track@1"/>
<import as="text" from="@narratage/typography-track@1"/>
<import as="audio" from="@narratage/audio-track@1"/>
<import as="space" from="@narratage/spatial@1"/>

<!-- Captions: primary style for all text -->
<fonts:Stack id="caption-font" family="inter" weight="700" style="normal"/>
<fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
<caption-fine:Style id="base-caption" recipe={studio.caption.base} font={caption-font}/>
<caption:Program id="caption-program" display={story.caption} default={base-caption}/>
<caption-ai:Planner id="cue-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
  space={speech.space} plan={cue-plan.plan} program={caption-program}/>

<!-- 共享位置是显式边，与 Media/Text 外观分开。 -->
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="6%" bottom="84%"/>
<space:Frame id="card-frame" within={vertical}
  left="10%" top="20%" right="10%" bottom="30%"/>

<!-- Media：Selection 期间显示一个普通 Item -->
<media-track:Track id="cards" map={timing.map} space={speech.space} canvas={vertical}>
  <media-track:Item video={motion.video} frame={card-frame}
    during={story.selection.demo} appearance={studio.media.card} motion={studio.motion.card}/>
</media-track:Track>

<!-- Text: persistent title overlay -->
<text:Style id="title-style" recipe={studio.text.title} font={title-font}/>
<text:Track id="titles" space={speech.space}>
  <text:Area id="meaning" placement={title-frame} style={title-style} during="program">
    MEANING
  </text:Area>
</text:Track>

<!-- Audio：先规范化一份已声明素材，再把它放满整个节目 -->
<media:Audio id="music" src="./assets/music.wav"/>
<pipeline:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>
<audio:Track id="music-bed" space={speech.space}>
  <audio:Clip source={music-media.media} during="program"
    playback="loop-end" gain="0.28" fade-in="600ms" fade-out="800ms"/>
</audio:Track>

<!-- 所有对等 Track 都进入 Film -->
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audioTrack}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
  <film:Track source={titles.track}/>
  <film:Track source={music-bed.track}/>
</film:Film>
```

每个 SVS Recipe 中的 `stack-order` 决定 z 轴排序：语音视觉层为 10，Media 为 40，字幕为 70，文字为 90。数值越高，渲染层越靠上。
