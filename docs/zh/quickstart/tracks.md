---
title: 字幕、Media 与文字
description: 视觉 Track 组件——字幕、媒体叠加层和文字叠加层。
---

# 字幕、Media 与文字

> **发布前说明：** Caption Fine、Media Track 与 Text 都执行各自声明的作者 Surface。
> 它们的作者 API 仍可演进；共享终端 Track/Visual IR 窄腰已在仓库内冻结，但尚未作为
> npm ABI 发布。

每个进入最终合成的视听内容都是一个对等的 **Track**。Track 是扁平的（无嵌套），其 z 轴顺序由 SVS 中的 `stack-order` 属性决定。本页介绍三个官方视觉 Track 包：字幕、Media 和文字叠加层。

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
  font: Inter; weight: 700; size: 58; line-height: 1; align: center;
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

必填的 `font=` 边携带一个按字节复现的 `FontStackRef`。主字体必须与 Recipe
的 weight/style 一致；每个 Fallback 保留自己的真实字体信息。省略字体栈会在编译时
失败，不会退回当前机器上的同名字体。

Recipe 同时包含 `cue-min-words`、`cue-max-words` 和完整字体/框参数。Fine 不声明任何
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
或绝对窗口内放置规范化图片、视频、动画或 Compositable Surface。

```svml
<import as="pipeline" from="@narratage/media-pipeline@1"/>
<import as="media-track" from="@narratage/media-track@1"/>
```

### media-track:Track 与 media-track:Item

位置是一条显式 Spatial Frame 边，外观和运动则是可复用的 SVS 值：

```svml
<seedance:Prompt id="product-direction">
  A clean vertical product film: the written script becomes semantic regions,
  then those regions assemble into a finished video.
</seedance:Prompt>

<seedance:Video id="product-motion" model="mini"
  prompt={product-direction} duration="5">
  <seedance:Reference image={product-reference} role="subject"/>
</seedance:Video>

<pipeline:Normalize id="product-media" source={product-motion.video}
  video="primary-moving" audio="none" span-authority="video" frame-rate="30"/>

<space:Frame id="product-frame" within={vertical}
  left="8%" top="20%" right="8%" bottom="32%"/>

<media-track:Track id="product-broll" map={timing.map}
  space={speech.space} canvas={vertical}>
  <media-track:Item source={product-media.media} frame={product-frame}
    during={story.selection.product-demo}
    appearance={studio.media.product}
    motion={studio.motion.product}/>
</media-track:Track>
```

Selection 只贡献语义点；Media 包负责将这些点投影为窗口。同一个 Item 模型也能表达全屏
切换、分屏和角落小窗。需要多个素材时，可以使用有序局部 Layer 或显式 Sequence。

**输出：**`{product-broll.visual}`；只有作者显式选择了源音频或 SFX 时才会出现
`{product-broll.audio}`。

## 文字叠加层

在屏幕上显示的静态或定时文字——标题、标注、下方三分之一字幕条。

```svml
<import as="text" from="@narratage/text-track@1"/>
```

### text:Track

文字项目的容器。

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="6%" bottom="84%"/>
<text:Track id="titles" space={speech.space}>
  <text:Item text="EDIT MEANING, NOT TIMELINES" during="full"
    frame={title-frame}
    appearance={studio.text.title}/>
</text:Track>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `space` | 是 | 来自 `speech:Spine` 的 ProgramSpace |
| `map` | 否 | SemanticMap——当项目使用基于 Selection 的计时时需要 |

### text:Item

每个项目是放置在某个时间位置的一段文本字符串：

```svml
<text:Item text="MEANING" during="full" frame={title-frame}
  appearance={studio.text.title}/>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `text` | 是 | 要显示的文本字符串 |
| `during` | 是 | 何时显示：`"full"`（整个节目时长）或 Selection 引用 |
| `frame` | 是 | 显式 `SpatialFrame`，定义位置和可用排版区域 |
| `appearance` | 是 | SVS 文字 Recipe——层级、字体、大小与 Paint |

`during` 属性接受字面字符串 `"full"`（表示整个节目时长），或 Selection 引用（用于语义计时）：

```svml
<text:Track id="callout" space={speech.space} map={timing.map}>
  <text:Item text="EXACTLY THE RIGHT MOMENT"
    during={story.selection.callout}
    frame={callout-frame}
    appearance={studio.text.callout}/>
</text:Track>
```

**输出：**`{titles.track}` —— 添加到 `film:Film` 的 VisualTrack。

## 组合示例

三种 Track 类型在一个源文件中协同使用：

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
<import as="pipeline" from="@narratage/media-pipeline@1"/>
<import as="media-track" from="@narratage/media-track@1"/>
<import as="text" from="@narratage/text-track@1"/>
<import as="space" from="@narratage/spatial@1"/>

<!-- Captions: primary style for all text -->
<fonts:Stack id="caption-font" family="inter" weight="700" style="normal"/>
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
<pipeline:Normalize id="motion-media" source={motion.video}
  video="primary-moving" audio="none" span-authority="video" frame-rate="30"/>
<media-track:Track id="cards" map={timing.map} space={speech.space} canvas={vertical}>
  <media-track:Item source={motion-media.media} frame={card-frame}
    during={story.selection.demo} appearance={studio.media.card} motion={studio.motion.card}/>
</media-track:Track>

<!-- Text: persistent title overlay -->
<text:Track id="titles" space={speech.space}>
  <text:Item text="MEANING" during="full" frame={title-frame}
    appearance={studio.text.title}/>
</text:Track>

<!-- All three tracks feed into Film -->
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audioTrack}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
  <film:Track source={titles.track}/>
</film:Film>
```

每个 SVS Recipe 中的 `stack-order` 决定 z 轴排序：语音视觉层为 10，Media 为 40，字幕为 70，文字为 90。数值越高，渲染层越靠上。
