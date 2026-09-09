---
title: Film & Rendering
description: Composing tracks into a film and rendering to video.
---

# Film & Rendering

Film is the final assembly stage. It takes all peer Tracks, validates them, and produces a
Composition. The renderer then compiles that Composition into an MP4 video.

```svml
<import as="space" from="@hypit/spatial@1"/>
<import as="film" from="@hypit/film@1"/>
<import as="render" from="@hypit/render-hyperframes@1"/>
```

## film:Film

Assembles all Tracks into a single Composition. Film itself has no domain knowledge — it does not
know what a caption is, what Media is, or what speech is. It takes any VisualTrack or AudioTrack
and layers them by stacking order.

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

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `canvas` | yes | Explicit CanvasSpace shared with Track layout |
| `semantic` | yes | SemanticTrack from `speech:Track` — defines duration and frame rate |
| `appearance` | yes | SVS Film Recipe — the canvas clear color |

### film:Track

Each `<film:Track>` child adds a Track source to the composition:

| Attribute | Required | Description |
|---|---|---|
| `source` | yes | A VisualTrack or AudioTrack from any upstream component |

Common Track sources:

| Source | Type | From |
|---|---|---|
| `{performance.visual}` | VisualTrack | `media-track:Track` — presentation of the semantic performance |
| `{speech.audio}` | AudioTrack | `speech:Track` — synchronized audio |
| `{captions.track}` | VisualTrack | a Caption Style-family Track — timed captions |
| `{cards.visual}` | VisualTrack | `media-track:Track` — media overlays or B-roll |
| `{titles.track}` | VisualTrack | `text:Track` — text overlays |

### Track stacking

Tracks are **flat** — there is no nesting or grouping. Z-ordering is determined entirely by the
`stack-order` property in each Track's SVS Recipe. Lower values go behind; higher values render on
top.

Typical stacking order:

| stack-order | Content |
|---|---|
| 10 | Performance presentation (author-selected) |
| 40 | Media overlays |
| 70 | Captions |
| 90 | Text overlays |

One component can emit multiple visual elements (Presents) at different z-positions, which
interleave with other components' Presents. The final render flattens all Presents, sorts by
absolute stacking key, and paints them onto one canvas.

**Output:** `{main.composition}` — the complete Composition, passed to the renderer.

## render:Video

Compiles the Composition into a finished video via the HyperFrames renderer.

```svml
<render:Video id="final" composition={main.composition} semantic={speech.semantic}/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `composition` | yes | Composition from `film:Film` |
| `semantic` | yes | SemanticTrack from `speech:Track` |

The renderer:

1. Compiles the Composition into a `HyperframesDocument` — an HTML representation of every frame
2. Renders each frame through Chrome/Chromium
3. Encodes the frame sequence into video
4. Mixes the audio Tracks
5. Muxes video + audio into the final MP4

**Output:** `{final.video}` — the finished video as an ordinary Resource-backed `BlobArtifact`.
This is the most common Build Target, and it can also be connected directly to later Blob consumers
such as media trimming, audio/frame extraction or a model reference input.

## Full pipeline walkthrough

The complete data flow from Script to rendered video. The Sources below are an abridged
illustration. The complete runnable project is `examples/podcast/`; the commands below use it.

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

  <!-- 3. Timing: normalize and align the Segment before assembly -->
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

`right` and `bottom` are absolute edge positions, not insets. A Frame spanning the middle 80% of
its parent is `left="10%" right="90%"`, not `left="10%" right="10%"` — the second resolves to zero
width and is rejected.

### Stylesheet (`recipes.svs`)

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

### Compile and verify

```bash
hypit check examples/podcast/reference.svml

hypit plan examples/podcast/reference.svrun
```

`check` compiles the Author Graph — validates all imports, types, and graph edges without calling
any external service. `plan` additionally compiles the Run Source and outputs the frozen BuildPlan
showing every Operation the Scheduler would issue. Inspect the plan before spending money.
