---
title: Film & Rendering
description: Composing tracks into a film and rendering to video.
---

# Film & Rendering

Film is the final assembly stage. It takes all peer Tracks, validates them, and produces a
Composition. The renderer then compiles that Composition into an MP4 video.

```svml
<import as="film" from="@narratage/film@1"/>
<import as="render" from="@narratage/render-hyperframes@1"/>
```

## film:Film

Assembles all Tracks into a single Composition. Film itself has no domain knowledge — it does not
know what a caption is, what B-roll is, or what speech is. It takes any VisualTrack or AudioTrack
and layers them by stacking order.

```svml
<film:Film id="main" space={speech.space} appearance={studio.film.vertical}>
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
| `space` | yes | ProgramSpace from `speech:Spine` — defines duration and frame rate |
| `appearance` | yes | SVS film Recipe — canvas width, height, frame rate, background |

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
| `{cards.visual}` | VisualTrack | `broll:Track` — B-roll overlays |
| `{titles.track}` | VisualTrack | `text:Track` — text overlays |

### Track stacking

Tracks are **flat** — there is no nesting or grouping. Z-ordering is determined entirely by the
`stack-order` property in each Track's SVS Recipe. Lower values go behind; higher values render on
top.

Typical stacking order:

| stack-order | Content |
|---|---|
| 10 | Speech visual (full-screen talking head) |
| 40 | B-roll overlays |
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

**Output:** `{final.video}` — the finished video file. This is the most common Build Target.

## Full pipeline walkthrough

The complete data flow from Script to rendered video. This example is based on
`examples/talking-film-graph-check/` — the smallest complete graph.

### Author Source (`main.svml`)

```svml
<?svml using="@narratage/text@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="whisperx" from="@narratage/whisperx@1"/>
  <import as="caption" from="@narratage/caption@1"/>
  <import as="caption-fine" from="@narratage/caption-fine@1"/>
  <import as="caption-ai" from="@narratage/caption-gemini@1"/>
  <import as="broll" from="@narratage/broll@1"/>
  <import as="text" from="@narratage/text-track@1"/>
  <import as="film" from="@narratage/film@1"/>
  <import as="render" from="@narratage/render-hyperframes@1"/>
  <import as="studio" source="./studio.svs"/>

  <!-- 1. Script: the semantic truth -->
  <script id="story">
    <opening><HOST>Meaning @demo becomes the source @/demo.</opening>
  </script>

  <!-- 2. Generation: Seedance talking head + standalone video -->
  <seedance:Prompt id="direction">
    Locked medium close-up in a quiet daylight studio.
  </seedance:Prompt>
  <seedance:Speech id="take" model="mini"
    dialogue={story.segment.opening.dialogue}
    prompt={direction} duration="5"/>
  <seedance:Video id="motion" model="mini"
    prompt={direction} duration="5"/>

  <!-- 3. Timing: assemble spine and align words -->
  <speech:Spine id="speech">
    <speech:Take source={take} segment={story.segment.opening}/>
  </speech:Spine>
  <whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>

  <!-- 4. Tracks: captions, B-roll, text -->
  <caption-fine:Style id="base-caption" recipe={studio.caption.base}/>
  <caption:Program id="caption-program" words={story.caption.words}
    default={base-caption}/>
  <caption-ai:Planner id="cue-plan" words={story.caption.words}
    program={caption-program} model="gemini-2.5-flash"/>
  <caption-fine:Track id="captions" narrative={story} words={story.caption.words} map={timing.map}
    space={speech.space} plan={cue-plan.plan} program={caption-program}/>

  <broll:Track id="cards" map={timing.map} space={speech.space}>
    <broll:Item source={motion.video} during={story.selection.demo}
      appearance={studio.broll.card}/>
  </broll:Track>

  <text:Track id="titles" space={speech.space}>
    <text:Item text="MEANING" during="full"
      appearance={studio.text.title}/>
  </text:Track>

  <!-- 5. Film: compose all tracks -->
  <film:Film id="main" space={speech.space}
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
    width: 1080; height: 1920; frame-rate: 30; background: #09090B;
  }
  broll.card {
    stack-order: 40; x: 0.1; y: 0.2; width: 0.8; height: 0.5;
    fit: cover; background: #111116; radius: 20;
    enter: slide-up 4f; exit: fade 4f;
  }
  caption.base {
    cue-min-words: 1; cue-max-words: 5;
    important-min-per-cue: 0; important-max-per-cue: 2;
    important-fill: #FFF16A; important-scale: 1.12;
    stack-order: 70; x: 0.08; y: 0.76; width: 0.84;
    font: Inter; weight: 600; size: 58; line-height: 1; align: center;
    fill: #FFFFFF; background: #09090BCC; padding: 16 24; radius: 18;
  }
  text.title {
    stack-order: 90; x: 0.06; y: 0.06; width: 0.88; height: 0.1;
    font: Inter; weight: 900; size: 64; align: center;
    fill: #FFFFFF; tracking: -1;
  }
</sheet>
```

### Run Source (`build.svrun`)

```svml
<?svml using="@narratage/run-text@1"?>

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
