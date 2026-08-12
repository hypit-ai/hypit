---
title: Caption, Media, Typography & Audio
description: Peer track components — captions, media, typography and authored audio.
---

# Caption, Media, Typography & Audio

Every audiovisual contribution entering the final composition is a peer **Track**. Tracks are flat
(no nesting), and visual z-order is determined by the `stack-order` property in SVS. This page
covers Caption, Media, Typography and Audio Track authoring.

## Caption system

Caption uses a small common language and a replaceable Style family:

```text
Script Display → Caption Program → Planner + measured Atom timing → Style-family Track
```

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="media" from="@narratage/media@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
```

`@narratage/caption` owns only common Cue bounds, generic optional per-Word fields, total Style
assignment, Plan validation and the timing join. `@narratage/caption-fine` is one field-free Style
family: it owns geometry, glyph/Cue/Pill Paint and layered local motion.

### caption-fine:Style

A Style is one indivisible pair of planning requirements and rendering parameters. Fine resolves
both from one package-owned SVS Recipe:

```svs
caption.primary {
  cue-min-words: 2;
  cue-max-words: 7;
  stack-order: 70; x: 0.5; y: 0.88; width: 0.84;
  anchor-x: center; anchor-y: bottom;
  size: 58;
  line-height: 0.96; letter-spacing: -0.5; word-gap: 14;
  align: center; direction: ltr;
  fill: #FFFFFF; opacity: 1;
  stroke-color: #09090B; stroke-width: 2;
  shadow-color: #000000; shadow-opacity: 0.72;
  shadow-x: 0; shadow-y: 3; shadow-blur: 8;
  glow-color: #FFFFFF; glow-opacity: 0.12; glow-blur: 8;
  gradient-from: #FFFFFF; gradient-to: #93C5FD; gradient-angle: 120;
  long-shadow-color: #111827; long-shadow-opacity: 0.35;
  long-shadow-distance: 8; long-shadow-angle: 45;
  background: #09090BCC; border-color: #FFFFFF20; border-width: 1;
  padding: 16 24; radius: 18;
  karaoke: trail; karaoke-transition: wipe;
  active-fill: #FFD54A;
  active-box: current; active-box-continuity: isolated;
  active-box-background: #FFD54ACC; active-box-padding: 4 8; active-box-radius: 8;
  active-underline: current; active-underline-color: #FFFFFF;
  active-underline-thickness: 3; active-underline-offset: 5;
  cue-enter: fade; cue-enter-frames: 4; cue-exit: fade; cue-exit-frames: 4;
  atom-reveal: all;
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

The required `font=` edge carries one byte-reproducible `FontStackRef`. Family, weight and style
exist only on that edge; each fallback retains its own exact face metadata. Fine rejects a Style
without that stack instead of falling back to machine fonts.

Another Caption package may define completely different planning fields and visual parameters
without changing the common package.

Fine's properties are orthogonal: Cue planning; normalized placement and anchor; layout and
typography; base/active solid or gradient glyph Paint; stroke, shadow, directional long shadow,
glow and underline; Cue/Pill Paint; three independent glyph/Pill/underline activation channels;
and layered Cue, Atom, active-response and loop motion. Missing optional dimensions resolve
deterministically to no decoration or motion. Unknown properties are rejected.

`karaoke` is `off`, `current` or `trail`; `karaoke-transition` is `step` or `wipe`. Timing is always
whole-Atom timing already proven by Caption. A normal one-word Atom therefore highlights per word,
while a Dual Text Atom remains one indivisible visible unit. Fine never guesses internal time.

`active-box` is independently `off`, `current` or `trail`. `active-box-continuity: isolated` paints
one capsule per activated Atom; `joined` turns a trail into one ordered prefix whose background is
continuous on each real browser line. Thus trail-colored text with a current-only Pill is one
Recipe—not a second renderer.

Fine wraps only between complete Atoms and never clips author text. It intentionally has no
`max-lines`; use Cue bounds, Track width and font size to control density.

CJK dialogue can be written directly. For a display-only emoji that still follows speech timing,
author the correspondence explicitly, such as `<🌐 | globe>`; the system will not invent a spoken
word for a bare symbol.

### caption:Program

The Program starts from the complete ordered display-word universe emitted by Script. One explicit
default Style covers every word; no `@whole` Selection or complement is required. Ordered `Use`
rules replace the whole Style on a Role or explicit Caption word subset, with the last match winning.

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

`role=` is convenient author syntax for a word subset, not a temporal condition. `words=` consumes
the Caption-specific projection of a Script Selection; the public time Selection remains only a
pair of semantic anchors. Partial ownership of an indivisible Dual Text display word is rejected.
`Mute` uses that same exact word projection, stays out of Gemini, and hides those complete Atoms
after Cue planning without regrouping the Cue.

### caption-ai:Planner

```svml
<caption-ai:Planner id="caption-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
```

The planner receives immutable display Atoms/Words and already-resolved Style runs. It may only cut
each run between whole Atoms and attach declared fields to Word ids. Fine declares no fields. The
planner cannot rewrite text, select Styles, see audio or invent time. Its output is
`{caption-plan.plan}`.

### caption-fine:Track

```svml
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

The common Caption timing step joins the Plan to the independent SemanticMap. Fine then renders all
default and override Styles into one ordinary peer `VisualTrack`: `{captions.track}`.

## Media overlays and B-roll

B-roll is an editorial use of the generic Media Track, not a separate Track family. One Item can
place an image, generated video, prepared timed medium or compositable Surface at a semantic or
absolute window.

```svml
<import as="media-track" from="@narratage/media-track@1"/>
<import as="wording" from="@narratage/text@1"/>
```

### media-track:Track and media-track:Item

Placement is an explicit Spatial Frame edge; appearance and motion remain reusable SVS values.

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

The Selection contributes semantic points; Media performs the package-owned window projection.
The same Item model also covers full-canvas cutaways, split screens and corner overlays. Ordered
child layers, source occupancy and explicit Sequences are available when one source is not enough.

Every Item, Member or sample Layer declares exactly one visual input form:

| Input | Value | Meaning |
|---|---|---|
| `image={...}` + `extent={...}` | Blob + authored pixel extent | A durationless still image |
| `video={...}` | Generated/raw video Blob | Inspect, select and normalize to this Track's `space` automatically |
| `media={...}` | `SynchronizedMedia` | Connect an explicitly prepared timed source directly |
| `surface={...}` | `CompositableSurfaceRef` | Connect an alpha-aware still or timed surface directly |

Raw `video=` is visual-only by default. Add `audio="include"` when its own audio should be
normalized and emitted by the Track; `audio-gain` remains available for that selected source.
These forms are explicit so a generic Blob is never guessed to be an image or video. The convenient
surface syntax does not bypass the graph: `video=` expands to ordinary bind-request, inspect,
select and normalize Operations. An explicit `<pipeline:Normalize>` remains available for shared
or specially selected media, whose output then connects through `media=`.

**Outputs:** `{product-broll.visual}` and, only when explicitly authored, `{product-broll.audio}`.

## Audio tracks

`@narratage/audio-track` places explicitly prepared audio on the same ProgramSpace as the visual
Tracks. A `Clip` consumes `SynchronizedMedia`; normalize a declared or generated audio Blob first,
then choose its exact program window and occupancy:

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

| Attribute | Required | Description |
|---|---|---|
| `Track.id` | yes | Stable Audio Track identity |
| `Track.space` | yes | ProgramSpace that defines the exact sample and frame domain |
| `Clip.source` | yes | Explicitly selected and normalized `SynchronizedMedia` |
| `during`, `at`/`for`, or `start`/`end` | exactly one form | Whole-program, Selection, Moment, or explicit window |
| `map` | for Selection/Moment | SemanticMap used to resolve semantic timing |
| `playback` | no | `once`, `once-end`, `loop`, `loop-end`, or bounded `stretch` |
| `occurrences` | no | `one` or `each` when a semantic source has multiple occurrences |
| `trim-start`, `trim-end` | no | Exact source trim |
| `gain`, `fade-in`, `fade-out` | no | Explicit per-clip mix values |

The package performs no automatic extraction, normalization, ducking, or bus routing. Multiple
Clips in one Track and multiple peer Audio Tracks remain independent inputs to Film. The output is
`{music-bed.track}`, an ordinary `AudioTrack`.

## Text overlays

Static or timed text displayed on screen — titles, callouts, lower thirds.

```svml
<import as="text" from="@narratage/typography-track@1"/>
<import as="wording" from="@narratage/text@1"/>
```

### text:Track

Container for text items.

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

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `space` | yes | ProgramSpace from `speech:Spine` |
| `map` | no | SemanticMap — needed when items use Selection-based timing |

### text:Point, text:Area and text:Path

Each item has one explicit placement form, one exact Style and one temporal projection. `Area`
places flowing text inside a `SpatialFrame`:

```svml
<text:Area id="meaning" placement={title-frame} style={title-style} during="program">
  MEANING
</text:Area>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Stable item identity |
| child content or `content` | yes | Inline plain/rich content, or an ordinary graph `Text` reference; the two forms are exclusive |
| `during` | yes | `"program"` or a Selection reference; `at` and explicit `start`/`end` are also available |
| `placement` | yes | `SpatialPoint`, `SpatialFrame` or `SpatialPath`, matching the item form |
| `style` | yes | A `text:Style` compiled from an SVS Recipe plus exact font bytes |

The `during` attribute accepts either the literal string `"program"` for the complete ProgramSpace,
or a Selection reference for semantic timing:

```svml
<text:Style id="callout-style" recipe={studio.text.callout} font={title-font}/>
<text:Track id="callout" space={speech.space} map={timing.map}>
  <text:Area id="callout-copy" placement={callout-frame}
    style={callout-style} during={story.selection.callout}>
    EXACTLY THE RIGHT MOMENT
  </text:Area>
</text:Track>
```

Graph-produced copy remains visible as an edge:

```svml
<wording:Value id="headline">EXACTLY THE RIGHT MOMENT</wording:Value>
<text:Track id="callout" space={speech.space}>
  <text:Area id="callout-copy" content={headline}
    placement={callout-frame} style={callout-style} during="program"/>
</text:Track>
```

The generic Text value supplies only characters. Typography still owns the item document wrapper,
placement, timing, style and motion. Use inline `P`/`Span`/`Break` when the author needs rich runs.

**Output:** `{titles.track}` — a VisualTrack added to `film:Film`.

## Combination example

All four track families together in one source file:

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

<!-- Shared placement is an explicit edge, separate from Text appearance. -->
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="6%" bottom="84%"/>
<space:Frame id="card-frame" within={vertical}
  left="10%" top="20%" right="10%" bottom="30%"/>

<!-- Media: one ordinary Item used editorially as B-roll -->
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

<!-- Audio: normalize one declared source, then place it for the complete program -->
<media:Audio id="music" src="./assets/music.wav"/>
<pipeline:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>
<audio:Track id="music-bed" space={speech.space}>
  <audio:Clip source={music-media.media} during="program"
    playback="loop-end" gain="0.28" fade-in="600ms" fade-out="800ms"/>
</audio:Track>

<!-- All peer tracks feed into Film -->
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audioTrack}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
  <film:Track source={titles.track}/>
  <film:Track source={music-bed.track}/>
</film:Film>
```

The `stack-order` in each SVS Recipe determines z-ordering: speech visual at 10, media at 40,
captions at 70, text at 90. Higher values render on top.
