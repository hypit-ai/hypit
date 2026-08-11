---
title: Film 与渲染
description: 将 Track 组合为 Film 并渲染为视频。
---

# Film 与渲染

Film 是最终的组装阶段。它接收所有对等的 Track，对其进行验证，并生成一个
Composition。然后渲染器将该 Composition 编译为 MP4 视频。

```svml
<import as="space" from="@narratage/spatial@1"/>
<import as="film" from="@narratage/film@1"/>
<import as="render" from="@narratage/render-hyperframes@1"/>
```

## film:Film

将所有 Track 组装为单一的 Composition。Film 本身没有领域知识——它不知道什么是字幕、
什么是 Media、什么是语音。它接收任何 VisualTrack 或 AudioTrack，并按堆叠顺序将它们分层。

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audioTrack}/>
  <film:Track source={captions.track}/>
  <film:Track source={product-broll.visual}/>
  <film:Track source={titles.track}/>
</film:Film>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `canvas` | 是 | 与 Track 布局共享的显式 CanvasSpace |
| `space` | 是 | 来自 `speech:Spine` 的 ProgramSpace——定义时长和帧率 |
| `appearance` | 是 | SVS Film Recipe——画布清除颜色 |

### film:Track

每个 `<film:Track>` 子元素向 Composition 添加一个 Track 来源：

| 属性 | 必填 | 说明 |
|---|---|---|
| `source` | 是 | 来自任何上游组件的 VisualTrack 或 AudioTrack |

常见的 Track 来源：

| 来源 | 类型 | 来自 |
|---|---|---|
| `{speech.visual}` | VisualTrack | `speech:Spine`——全屏说话人画面 |
| `{speech.audioTrack}` | AudioTrack | `speech:Spine`——同步音频 |
| `{captions.track}` | VisualTrack | Caption 样式族 Track——定时字幕 |
| `{cards.visual}` | VisualTrack | `media-track:Track`——Media 叠加层或 B-roll |
| `{titles.track}` | VisualTrack | `text:Track`——文字叠加层 |

### Track 堆叠

Track 是**扁平的**——没有嵌套或分组。Z 轴排序完全由每个 Track 的 SVS Recipe 中的
`stack-order` 属性决定。较低的值在后面；较高的值渲染在上面。

典型的堆叠顺序：

| stack-order | 内容 |
|---|---|
| 10 | 语音画面（全屏说话人画面） |
| 40 | Media 叠加层 |
| 70 | 字幕 |
| 90 | 文字叠加层 |

一个组件可以在不同的 z 位置发出多个视觉元素（Presents），这些元素会与其他组件的 Presents
交错排列。最终渲染会将所有 Presents 展平，按绝对堆叠键排序，然后绘制到一个画布上。

**输出：** `{main.composition}`——完整的 Composition，传递给渲染器。

## render:Video

通过 HyperFrames 渲染器将 Composition 编译为最终视频。

```svml
<render:Video id="final" composition={main.composition} space={speech.space}/>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识符 |
| `composition` | 是 | 来自 `film:Film` 的 Composition |
| `space` | 是 | 来自 `speech:Spine` 的 ProgramSpace |

渲染器：

1. 将 Composition 编译为 `HyperframesDocument`——每一帧的 HTML 表示
2. 通过 Chrome/Chromium 渲染每一帧
3. 将帧序列编码为视频
4. 混合音频 Track
5. 将视频和音频混合封装为最终的 MP4

**输出：** `{final.video}`——以普通内容寻址 `BlobArtifact` 表示的最终视频。这是最常见的
Build Target，也可以直接接到媒体裁切、音频/帧提取或模型参考输入等后续 Blob 消费者。

## 完整的管线流程

从 Script 到渲染视频的完整数据流。本示例基于
`examples/talking-film-graph-check/`——最小的完整图。

### Author Source (`main.svml`)

```svml
<?svml using="@narratage/markup@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="wording" from="@narratage/text@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="whisperx" from="@narratage/whisperx@1"/>
  <import as="caption" from="@narratage/caption@1"/>
  <import as="caption-fine" from="@narratage/caption-fine@1"/>
  <import as="caption-ai" from="@narratage/caption-gemini@1"/>
  <import as="fonts" from="@narratage/fonts-open@1"/>
  <import as="media-track" from="@narratage/media-track@1"/>
  <import as="text" from="@narratage/typography-track@1"/>
  <import as="space" from="@narratage/spatial@1"/>
  <import as="film" from="@narratage/film@1"/>
  <import as="render" from="@narratage/render-hyperframes@1"/>
  <import as="studio" source="./studio.svs"/>

  <!-- 1. Script: the semantic truth -->
  <script id="story">
    <opening><HOST>Meaning @demo becomes the source @/demo.</opening>
  </script>

  <!-- 2. Generation: Seedance talking head + standalone video -->
  <wording:Value id="direction">
    Locked medium close-up in a quiet daylight studio. Spoken dialogue — say exactly: Meaning becomes the source.
  </wording:Value>
  <seedance:TextVideo id="take" model="mini"
    prompt={direction} duration="5" generate-audio="true"/>
  <seedance:TextVideo id="motion" model="mini"
    prompt={direction} duration="5"/>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <space:Frame id="title-frame" within={vertical}
    left="6%" top="6%" right="6%" bottom="84%"/>
  <space:Frame id="card-frame" within={vertical}
    left="10%" top="20%" right="10%" bottom="30%"/>

  <!-- 3. Timing: assemble spine and align words -->
  <speech:Spine id="speech" canvas={vertical} frame-rate="30">
    <speech:Take video={take.video} segment={story.segment.opening}/>
  </speech:Spine>
  <whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>

  <!-- 4. Tracks: captions, Media, text -->
  <fonts:Stack id="caption-font" family="inter" weight="700" style="normal"/>
  <fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
  <caption-fine:Style id="base-caption" recipe={studio.caption.base} font={caption-font}/>
  <caption:Program id="caption-program" display={story.caption}
    default={base-caption}/>
  <caption-ai:Planner id="cue-plan" display={story.caption}
    program={caption-program} model="gemini-2.5-flash"/>
  <caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
    space={speech.space} plan={cue-plan.plan} program={caption-program}/>

  <media-track:Track id="cards" map={timing.map}
    space={speech.space} canvas={vertical}>
    <media-track:Item video={motion.video} during={story.selection.demo}
      frame={card-frame} appearance={studio.media.card} motion={studio.motion.card}/>
  </media-track:Track>
  <text:Style id="title-style" recipe={studio.text.title} font={title-font}/>
  <text:Track id="titles" space={speech.space}>
    <text:Area id="meaning" placement={title-frame} style={title-style} during="program">
      MEANING
    </text:Area>
  </text:Track>

  <!-- 5. Film: compose all tracks -->
  <film:Film id="main" canvas={vertical} space={speech.space}
    appearance={studio.film.vertical}>
    <film:Track source={speech.visual}/>
    <film:Track source={speech.audioTrack}/>
    <film:Track source={cards.visual}/>
    <film:Track source={captions.track}/>
    <film:Track source={titles.track}/>
  </film:Film>

  <!-- 6. Render: compile to MP4 -->
  <render:Video id="final" composition={main.composition}
    space={speech.space}/>
</svml>
```

### 样式表 (`studio.svs`)

```svs
<?svml using="@narratage/svs@1"?>

<sheet version="1">
  film.vertical {
    background: #09090B;
  }
  media.card {
    stack-order: 40; fit: cover; playback: hold-start;
    frame-paint: #111116; clip: rounded; radius: 20;
  }
  motion.card {
    enter: slide; enter-frames: 4; enter-direction: up; enter-easing: ease-out;
    exit: fade; exit-frames: 4; exit-easing: ease-in;
  }
  caption.base {
    cue-min-words: 1; cue-max-words: 5;
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
<?svml using="@narratage/run-markup@1"?>

<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="exact"/>
  </target-set>
</svrun>
```

### 编译与验证

```bash
node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

`check` 编译 Author Graph——验证所有导入、类型和图的边，而不调用任何外部服务。`plan`
还会额外编译 Run Source 并输出冻结的 BuildPlan，展示调度器将发出的每个 Operation。在花费资金之前请先检查计划。
