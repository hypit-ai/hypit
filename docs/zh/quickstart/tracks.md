---
title: 字幕、Media 与 Typography
description: 视觉 Track 组件——字幕、媒体叠加层和排版叠加层。
---

# 字幕、Media 与 Typography

每个进入最终合成的视听内容都是一个对等的 **Track**。Track 是扁平的（无嵌套），其 z 轴顺序由 SVS 中的 `stack-order` 属性决定。本页介绍三个官方视觉 Track 包：字幕、Media 和 Typography 叠加层。

## 字幕系统

字幕由一套很小的公共语言与可替换的样式族组成：

```text
Script 显示全集 → Caption Program → Planner + Atom 实测时间 → 样式族 Track
```

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
```

公共 Caption 只负责 Cue 字数边界、可选的通用逐词字段、完整样式分配、Plan 校验与时间拼接。Fine 是第一种无字段样式族，负责自己的几何、字形/Cue/Pill Paint 与局部动画。

### caption-fine:Style

一个 Style 是不可拆分的"规划要求 + 渲染参数"。Fine 从一个包自有的 SVS Recipe 同时解析两者：

```svml
<fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal"/>
<caption-fine:Style id="primary-caption" recipe={studio.caption.primary}
  font={caption-fonts}/>
```

必填的 `font=` 边携带一个按字节复现的 `FontStackRef`。Fine 省略字体栈会在编译时失败，不会退回当前机器上的同名字体。

### caption:Program

Program 消费 Script 显式输出的完整有序显示词全集。一个必填的默认 Style 自动覆盖所有词。

```svml
<caption:Program id="caption-program" display={story.caption}
  default={primary-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
  <caption:Mute words={story.caption.selection.private}/>
</caption:Program>
```

### caption-ai:Planner

```svml
<caption-ai:Planner id="caption-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
```

Planner 只接收不可改写的显示 Atom/Word 与已解析好的 Style runs。它只能在完整 Atom 之间分 Cue，并给 Word id 附上样式声明的字段；Fine 没有字段。

### caption-fine:Track

```svml
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

公共 Caption 先把 Plan 与独立 SemanticMap 拼接，Fine 再把所有默认/覆盖样式渲染成一个普通的对等 `VisualTrack`：`{captions.track}`。

## Media 叠加层

一个 Item 可以在语义或绝对窗口内放置规范化图片、视频、动画或 Compositable Surface。

```svml
<import as="pipeline" from="@narratage/media-pipeline@1"/>
<import as="media-track" from="@narratage/media-track@1"/>
```

### media-track:Track 与 media-track:Item

位置是一条显式 Spatial Frame 边，外观和运动则是可复用的 SVS 值：

```svml
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

同一个 Item 模型也能表达全屏切换、分屏和角落小窗。

**输出：**`{product-broll.visual}`；只有作者显式选择了源音频时才会出现 `{product-broll.audio}`。

## 文字叠加层

在屏幕上显示的静态或定时文字——标题、标注、下方三分之一字幕条。

```svml
<import as="text" from="@narratage/typography-track@1"/>
```

### text:Track

文字项目的容器。

```svml
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

### text:Area

把流式文字放入 `SpatialFrame`：

```svml
<text:Area id="meaning" placement={title-frame} style={title-style} during="program">
  MEANING
</text:Area>
```

| 属性 | 必填 | 描述 |
|---|---|---|
| `id` | 是 | 稳定的 Item 身份 |
| 子内容或 `content` | 是 | 内联纯文本/富文本，或普通图 `Text` 引用 |
| `during` | 是 | `"program"` 或 Selection 引用 |
| `placement` | 是 | 一个 `SpatialFrame` |
| `style` | 是 | 由 SVS Recipe 与精确字体字节共同编译出的 `text:Style` |

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
<import as="text" from="@narratage/typography-track@1"/>
<import as="space" from="@narratage/spatial@1"/>

<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="6%" bottom="84%"/>
<space:Frame id="card-frame" within={vertical}
  left="10%" top="20%" right="10%" bottom="30%"/>

<!-- Captions -->
<fonts:Stack id="caption-font" family="inter" weight="700" style="normal"/>
<caption-fine:Style id="base-caption" recipe={studio.caption.base} font={caption-font}/>
<caption:Program id="caption-program" display={story.caption} default={base-caption}/>
<caption-ai:Planner id="cue-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
  space={speech.space} plan={cue-plan.plan} program={caption-program}/>

<!-- Media overlay -->
<pipeline:Normalize id="motion-media" source={motion.video}
  video="primary-moving" audio="none" span-authority="video" frame-rate="30"/>
<media-track:Track id="cards" map={timing.map} space={speech.space} canvas={vertical}>
  <media-track:Item source={motion-media.media} frame={card-frame}
    during={story.selection.demo} appearance={studio.media.card} motion={studio.motion.card}/>
</media-track:Track>

<!-- Text overlay -->
<fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={studio.text.title} font={title-font}/>
<text:Track id="titles" space={speech.space}>
  <text:Area id="meaning" placement={title-frame} style={title-style} during="program">
    MEANING
  </text:Area>
</text:Track>
```

每个 SVS Recipe 中的 `stack-order` 决定 z 轴排序：语音视觉层为 10，Media 为 40，字幕为 70，文字为 90。数值越高，渲染层越靠上。
