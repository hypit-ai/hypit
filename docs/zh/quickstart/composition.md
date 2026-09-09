---
title: Film 与渲染
description: 将 Track 组合为 Film 并渲染为视频。
---

# Film 与渲染

Film 是最终的组装阶段。它接收所有对等的 Track，对其进行验证，并生成一个
Composition。然后渲染器将该 Composition 编译为 MP4 视频。

```svml
<import as="space" from="@hypit/spatial@1"/>
<import as="film" from="@hypit/film@1"/>
<import as="render" from="@hypit/render-hyperframes@1"/>
```

## film:Film

将选定的 VisualTrack 和 AudioTrack 组装为单一的 Composition。每份视觉贡献保留自己的
定时呈现和绘制顺序；声音通过选定的 AudioTrack 加入。

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<film:Film id="main" canvas={vertical} semantic={speech.semantic} appearance={recipes.film.vertical}>
  <film:Track source={performance.visual}/>
  <film:Track source={speech.audio}/>
  <film:Track source={captions.track}/>
  <film:Track source={product-broll.visual}/>
  <film:Track source={titles.track}/>
</film:Film>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `canvas` | 是 | 与 Track 布局共享的显式 CanvasSpace |
| `semantic` | 二选一 | 选定表演的 SemanticTrack，提供时长与帧率 |
| `space` | 二选一 | 作者声明的 ProgramSpace；与 `semantic` 选择其一 |
| `appearance` | 是 | SVS Film Recipe——画布清除颜色 |

### film:Track

每个 `<film:Track>` 子元素向 Composition 添加一个 Track 来源：

| 属性 | 必填 | 说明 |
|---|---|---|
| `source` | 是 | 来自任何上游组件的 VisualTrack 或 AudioTrack |

常见的 Track 来源：

| 来源 | 类型 | 来自 |
|---|---|---|
| `{performance.visual}` | VisualTrack | `media-track:Track`——语义表演的画面呈现 |
| `{speech.audio}` | AudioTrack | `speech:Track`——同步音频 |
| `{captions.track}` | VisualTrack | Caption 样式族 Track——定时字幕 |
| `{cards.visual}` | VisualTrack | `media-track:Track`——Media 叠加层或 B-roll |
| `{titles.track}` | VisualTrack | `text:Track`——文字叠加层 |

### Track 堆叠

Film 收集对等的 Track。每个 Track 可以包含多个独立定时、独立排序的呈现，称为 Present。
许多组件通过 Recipe 的 `stack-order` 暴露绘制顺序：较低的值在后面，较高的值在前面。
调整 Film 子元素的书写顺序不会改变这一绘制顺序。

典型的堆叠顺序：

| stack-order | 内容 |
|---|---|
| 10 | 示例口播视觉（作者显式选择，不是内置默认值） |
| 40 | Media 叠加层 |
| 70 | 字幕 |
| 90 | 文字叠加层 |

不同组件的 Present 可以交错排列。每个 Present 内部又拥有自己的元素树：多个视频、文字
和图形可以共享布局、遮罩或协同运动。项目组件可以用 HTML/CSS 浏览器程序实现这样的场景，
独立字幕或覆盖画面仍可以作为对等贡献。根据共同的表现关系分组，尺寸和素材类型不决定边界。

**输出：** `{main.composition}`——完整的 Composition，传递给渲染器。

## render:Video

通过 HyperFrames 渲染器将 Composition 编译为最终视频。

```svml
<render:Video id="final" composition={main.composition} semantic={speech.semantic}/>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `composition` | 是 | 来自 `film:Film` 的 Composition |
| `semantic` | 二选一 | Composition 选定的 SemanticTrack |
| `space` | 二选一 | Composition 使用的 ProgramSpace；与 `semantic` 选择其一 |

渲染器：

1. 将 Composition 编译为 `HyperframesDocument`——每一帧的 HTML 表示
2. 通过 Chrome/Chromium 渲染每一帧
3. 将帧序列编码为视频
4. 混合音频 Track
5. 将视频和音频混合封装为最终的 MP4

**输出：** `{final.video}`——以普通内容寻址 `BlobArtifact` 表示的最终视频。这是最常见的
Build Target，也可以直接接到媒体裁切、音频/帧提取或模型参考输入等后续 Blob 消费者。

## 完全由组件绘制的影片

对于口播作品，Script 的 Selection 和 Moment 保留话语与呈现之间的关系。聊天动画或图解
也可以自行安排阅读节奏：声明影片时钟，让场景组件、Film 和 Render 使用它。

```svml
<import as="time" from="@hypit/program-space@1"/>
<time:Space id="animation" frame-rate="30" duration="8s"/>
<!-- scene.track 由使用同一时钟的组件产生。 -->
<film:Film id="main" canvas={canvas} space={animation} appearance={recipes.film.main}>
  <film:Track source={scene.track}/>
</film:Film>
<render:Video id="final" composition={main.composition} space={animation}/>
```

场景事件可以采用作者指定的秒数或帧数。在口播编排中，同一种表现也可以跟随投影后的 Script
事件。组件直接绘制画面，声明时长无需背景图片或静音表演；未选择 AudioTrack 时，交付视频无声。

## 完整的管线流程

从 Script 到渲染视频的完整数据流。下面的 Source 是删节示意；可运行的完整项目见
`examples/podcast/`，本节末尾的命令针对该项目。

### Author Source (`main.svml`)

```svml
<?svml using="@hypit/markup@1"?>

<svml>
  <import from="@hypit/script@1"/>
  <import as="wording" from="@hypit/text@1"/>
  <import as="gpt" from="@hypit/gpt-image@1"/>
  <import as="seedance" from="@hypit/seedance@1"/>
  <import as="pipeline" from="@hypit/media-pipeline@1"/>
  <import as="speech" from="@hypit/speech-track@1"/>
  <import as="whisperx" from="@hypit/whisperx@1"/>
  <import as="caption" from="@hypit/caption@1"/>
  <import as="caption-fine" from="@hypit/caption-fine@1"/>
  <import as="fonts" from="@hypit/fonts-open@1"/>
  <import as="media-track" from="@hypit/media-track@1"/>
  <import as="text" from="@hypit/typography-track@1"/>
  <import as="space" from="@hypit/spatial@1"/>
  <import as="program" from="@hypit/program-space@1"/>
  <import as="film" from="@hypit/film@1"/>
  <import as="render" from="@hypit/render-hyperframes@1"/>
  <import as="recipes" source="./recipes.svs"/>

  <!-- 1. Script: the semantic truth -->
  <script id="story">
    <opening><HOST>Meaning @demo becomes the source @/demo.</opening>
  </script>

  <!-- 2. Generation: Seedance talking head + standalone video -->
  <wording:Value id="direction">
    Locked medium close-up in a quiet daylight studio. Spoken dialogue — say exactly: Meaning becomes the source.
  </wording:Value>
  <wording:Value id="scene-look">
    A photograph with the texture of real iPhone footage. Generate a vertical seated medium
    close-up, as one frame cut out of video actually shot on an iPhone: genuinely real rather than
    glossy, carrying the texture of video and not of a posed photograph. The background stays clearly
    visible, with no depth-of-field blur. Skin texture is fine and real, the light is natural, and no
    part of the picture is broken. One presenter at a desk in a quiet daylight studio.
  </wording:Value>
  <gpt:Image id="studio-scene" prompt={scene-look} aspect-ratio="9:16" resolution="2K"/>
  <seedance:ReferenceVideo id="take" model="mini"
    prompt={direction} duration="5" generate-audio="true">
    <seedance:Reference image={studio-scene.image}/>
  </seedance:ReferenceVideo>
  <seedance:ReferenceVideo id="motion" model="mini"
    prompt={direction} duration="5">
    <seedance:Reference image={studio-scene.image}/>
  </seedance:ReferenceVideo>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <program:Clock id="clock" frame-rate="30"/>
  <space:Frame id="speech-frame" within={vertical}
    left="0%" top="0%" right="100%" bottom="100%"/>
  <space:Frame id="title-frame" within={vertical}
    left="6%" top="6%" right="94%" bottom="16%"/>
  <space:Frame id="card-frame" within={vertical}
    left="10%" top="20%" right="90%" bottom="70%"/>

  <!-- 3. Timing：先归一化并对齐 Segment，再装配 -->
  <pipeline:Normalize id="take-media" source={take.video}
    video="primary-moving" audio="default" span-authority="video" clock={clock}/>
  <pipeline:Normalize id="motion-media" source={motion.video}
    video="primary-moving" audio="none" span-authority="video" clock={clock}/>
  <whisperx:SemanticTake id="opening-semantic" narrative={story}
    segment={story.segment.opening} media={take-media.media} language="en"/>
  <speech:Track id="speech">
    <speech:Take source={opening-semantic.take}/>
  </speech:Track>
<media-track:Track id="performance" semantic={speech.semantic} canvas={vertical}>
  <media-track:Performance during="program" frame={speech-frame}
    appearance={recipes.media.performance}/>
</media-track:Track>

  <!-- 4. Tracks: captions, Media, text -->
  <fonts:Stack id="caption-font" family="inter" weight="700" style="normal"/>
  <fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
  <caption-fine:Style id="base-caption" recipe={recipes.caption.base} font={caption-font}/>
  <caption:Program id="caption-program" document={story.caption} narrative={story}
    default={base-caption}/>
  <caption-fine:Track id="captions" document={story.caption}
    semantic={speech.semantic} program={caption-program}/>

  <media-track:Track id="cards" semantic={speech.semantic} canvas={vertical}>
    <media-track:Item media={motion-media.media} during={story.selection.demo}
      frame={card-frame} appearance={recipes.media.card} motion={recipes.motion.card}/>
  </media-track:Track>
  <text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
  <text:Track id="titles" semantic={speech.semantic}>
    <text:Area id="meaning" placement={title-frame} style={title-style} during="program">
      MEANING
    </text:Area>
  </text:Track>

  <!-- 5. Film: compose all tracks -->
  <film:Film id="main" canvas={vertical} semantic={speech.semantic}
    appearance={recipes.film.vertical}>
    <film:Track source={performance.visual}/>
    <film:Track source={speech.audio}/>
    <film:Track source={cards.visual}/>
    <film:Track source={captions.track}/>
    <film:Track source={titles.track}/>
  </film:Film>

  <!-- 6. Render: compile to MP4 -->
  <render:Video id="final" composition={main.composition}
    semantic={speech.semantic}/>
</svml>
```

`right` 与 `bottom` 是绝对的边位置，不是内缩量。一个占父级中间 80% 的 Frame 写作 `left="10%" right="90%"`，而不是 `left="10%" right="10%"`——后者解出的宽度为零，会被拒绝。

### 样式表 (`recipes.svs`)

```svs
<?svml using="@hypit/svs@1"?>

<sheet version="1">
  film.vertical {
    background: #09090B;
  }
  media.performance { stack-order: 0; fit: cover; }
  media.card {
    stack-order: 40; fit: cover; playback: hold-start;
    frame-paint: #111116; clip: rounded; radius: 20;
  }
  motion.card {
    enter: slide; enter-frames: 4; enter-direction: up; enter-easing: ease-out;
    exit: fade; exit-frames: 4; exit-easing: ease-in;
  }
  caption.base {
    stack-order: 70; x: 0.08; y: 0.76; width: 0.84;
    size: 58; line-height: 1; align: center;
    fill: #FFFFFF; background: #09090BCC; padding: 16 24; radius: 18;
  }
  text.title {
    stack-order: 90;
    font: Inter; weight: 900; size: 64; align: center;
    fill: #FFFFFF; tracking: -1;
  }
</sheet>
```

### Run Source (`build.svrun`)

```svml
<?svml using="@hypit/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
</svrun>
```

### 编译与验证

```bash
hypit check examples/podcast/reference.svml

hypit plan examples/podcast/reference.svrun
```

`check` 编译 Author Graph——验证所有导入、类型和图的边，而不调用任何外部服务。`plan`
还会额外编译 Run Source 并输出冻结的 BuildPlan，展示调度器将发出的每个 Operation。在花费资金之前请先检查计划。
