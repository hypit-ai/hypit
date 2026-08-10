---
title: Film & Rendering
description: Composing tracks into a film and rendering to video.
---

# Film & Rendering

Film is the final assembly stage. It takes all peer Tracks, validates them, and produces a
Composition. The renderer then compiles that Composition into an MP4 video.

```svml
<import as="space" from="@narratage/spatial@1"/>
<import as="film" from="@narratage/film@1"/>
<import as="render" from="@narratage/render-hyperframes@1"/>
```

## film:Film

Assembles all Tracks into a single Composition. Film itself has no domain knowledge — it does not
know what a caption is, what Media is, or what speech is. It takes any VisualTrack or AudioTrack
and layers them by stacking order.

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

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `canvas` | yes | Explicit CanvasSpace shared with Track layout |
| `space` | yes | ProgramSpace from `speech:Spine` — defines duration and frame rate |
| `appearance` | yes | SVS Film Recipe — the canvas clear color |

### film:Track

Each `<film:Track>` child adds a Track source to the composition:

| Attribute | Required | Description |
|---|---|---|
| `source` | yes | A VisualTrack or AudioTrack from any upstream component |

Common Track sources:

| Source | Type | From |
|---|---|---|
| `{speech.visual}` | VisualTrack | `speech:Spine` — full-screen talking head |
| `{speech.audioTrack}` | AudioTrack | `speech:Spine` — synchronized audio |
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
| 10 | Speech visual (full-screen talking head) |
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
<render:Video id="final" composition={main.composition} space={speech.space}/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `composition` | yes | Composition from `film:Film` |
| `space` | yes | ProgramSpace from `speech:Spine` |

The renderer:

1. Compiles the Composition into a `HyperframesDocument` — an HTML representation of every frame
2. Renders each frame through Chrome/Chromium
3. Encodes the frame sequence into video
4. Mixes the audio Tracks
5. Muxes video + audio into the final MP4

**Output:** `{final.video}` — the finished video as an ordinary content-addressed `BlobArtifact`.
This is the most common Build Target, and it can also be connected directly to later Blob consumers
such as media trimming, audio/frame extraction or a model reference input.

## Full pipeline walkthrough

The complete data flow from Script to rendered video. This example is based on
`examples/talking-film-graph-check/` — the smallest complete graph.

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

### Stylesheet (`studio.svs`)

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

### Compile and verify

```bash
pnpm narratage check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

pnpm narratage plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

`check` compiles the Author Graph — validates all imports, types, and graph edges without calling
any external service. `plan` additionally compiles the Run Source and outputs the frozen BuildPlan
showing every Operation the Scheduler would issue. Inspect the plan before spending money.
