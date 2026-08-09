---
title: Caption, B-roll & Text
description: Visual track components — captions, B-roll overlays and text overlays.
---

# Caption, B-roll & Text

> **Executable-slice note:** Caption Fine is the current complete package. The B-roll and Text
> sections document today's executable vertical slices. Their intended replacement author models
> are specified in `spec/media-track.md`, `spec/spatial-layout.md` and `spec/text-track.md`; examples
> using those future Surfaces will replace these sections only after the packages execute.

Every audiovisual contribution entering the final composition is a peer **Track**. Tracks are flat
(no nesting), and their z-order is determined by the `stack-order` property in SVS. This page
covers the three main visual Track types: captions, B-roll, and text overlays.

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
  font: Inter; weight: 700; size: 58; font-style: normal;
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

The explicit `font=` edge carries one byte-reproducible `FontStackRef`. The primary face must match
the Recipe's weight/style; each fallback retains its
own exact face metadata. Omitting the stack deliberately uses the Recipe's `font` family as an
environment fallback; neither Caption nor the Runtime chooses a font on the author's behalf.

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
continuous on each real browser line. Thus trail-colored text with a current-only Pill, the original
Twinit behavior, is one Recipe—not a second renderer.

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

## B-roll

B-roll overlays generated or provided video/images at semantic time positions.

```svml
<import as="broll" from="@narratage/broll@1"/>
```

### broll:Track

Container for B-roll items. Takes the SemanticMap for timing resolution.

```svml
<broll:Track id="product-broll" map={timing.map} space={speech.space}>
  <broll:Item source={product-motion.video}
    during={story.selection.product-demo}
    appearance={studio.broll.product}/>
</broll:Track>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `map` | yes | SemanticMap from `whisperx:Alignment` |
| `space` | no | ProgramSpace (required by some configurations) |

### broll:Item

Each item places a source at a semantic time position with styled appearance:

```svml
<broll:Item source={product-motion.video}
  during={story.selection.product-demo}
  appearance={studio.broll.product}/>
```

| Attribute | Required | Description |
|---|---|---|
| `source` | yes | Video or image — from `seedance:Video`, `media:Image`, etc. |
| `during` | yes | Selection reference — when this item appears |
| `appearance` | yes | SVS broll Recipe — position, size, fit, animations |

The `during` attribute takes a Selection reference like `{story.selection.product-demo}`. The B-roll
item appears on screen for exactly the duration of that Selection, as resolved through the
SemanticMap.

The appearance Recipe controls enter/exit animations:

```svs
broll.product {
  stack-order: 40;
  x: 0.08; y: 0.20; width: 0.84; height: 0.48;
  fit: contain;
  background: #111116;
  radius: 28;
  enter: slide-up 8f;
  exit: fade 6f;
}
```

**Output:** `{product-broll.visual}` — a VisualTrack added to `film:Film`.

### B-roll example

B-roll with a generated Seedance video appearing during a Script Selection:

```svml
<seedance:Prompt id="product-direction">
  A clean vertical product film: the written script becomes semantic regions,
  then those regions assemble into a finished video.
</seedance:Prompt>

<seedance:Video id="product-motion" model="mini"
  prompt={product-direction} duration="5">
  <seedance:Reference image={product-reference} role="subject"/>
</seedance:Video>

<broll:Track id="product-broll" map={timing.map}>
  <broll:Item source={product-motion.video}
    during={story.selection.product-demo}
    appearance={studio.broll.product}/>
</broll:Track>
```

## Text overlays

Static or timed text displayed on screen — titles, callouts, lower thirds.

```svml
<import as="text" from="@narratage/text-track@1"/>
```

### text:Track

Container for text items.

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

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `space` | yes | ProgramSpace from `speech:Spine` |
| `map` | no | SemanticMap — needed when items use Selection-based timing |

### text:Item

Each item is a text string placed at a time position:

```svml
<text:Item text="MEANING" during="full" frame={title-frame}
  appearance={studio.text.title}/>
```

| Attribute | Required | Description |
|---|---|---|
| `text` | yes | The text string to display |
| `during` | yes | When to show: `"full"` (entire program) or a Selection reference |
| `frame` | yes | Explicit `SpatialFrame` defining placement and available layout area |
| `appearance` | yes | SVS text Recipe — stacking, font, size and Paint |

The `during` attribute accepts either the literal string `"full"` for the entire program duration, or
a Selection reference for semantic timing:

```svml
<text:Track id="callout" space={speech.space} map={timing.map}>
  <text:Item text="EXACTLY THE RIGHT MOMENT"
    during={story.selection.callout}
    frame={callout-frame}
    appearance={studio.text.callout}/>
</text:Track>
```

**Output:** `{titles.track}` — a VisualTrack added to `film:Film`.

## Combination example

All three track types together in one source file:

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="broll" from="@narratage/broll@1"/>
<import as="text" from="@narratage/text-track@1"/>
<import as="space" from="@narratage/spatial@1"/>

<!-- Captions: primary style for all text -->
<caption-fine:Style id="base-caption" recipe={studio.caption.base}/>
<caption:Program id="caption-program" display={story.caption} default={base-caption}/>
<caption-ai:Planner id="cue-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
  space={speech.space} plan={cue-plan.plan} program={caption-program}/>

<!-- B-roll: generated video during a Selection -->
<broll:Track id="cards" map={timing.map} space={speech.space}>
  <broll:Item source={motion.video} during={story.selection.demo}
    appearance={studio.broll.card}/>
</broll:Track>

<!-- Shared placement is an explicit edge, separate from Text appearance. -->
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="6%" bottom="84%"/>

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

The `stack-order` in each SVS Recipe determines z-ordering: speech visual at 10, B-roll at 40,
captions at 70, text at 90. Higher values render on top.
