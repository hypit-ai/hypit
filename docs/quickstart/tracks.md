---
title: Caption, B-roll & Text
description: Visual track components — captions, B-roll overlays and text overlays.
---

# Caption, B-roll & Text

Every audiovisual contribution entering the final composition is a peer **Track**. Tracks are flat
(no nesting), and their z-order is determined by the `stack-order` property in SVS. This page
covers the three main visual Track types: captions, B-roll, and text overlays.

## Caption system

Captions are built from four components that form a pipeline:

```text
caption:Style → caption:Program → caption-ai:Planner → caption:Track
```

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
```

### caption:Style

Declares a complete visual appearance plus planning instructions for one style of caption.

```svml
<caption:Style id="primary-caption" appearance={studio.caption.primary}
  mode="proportional-word">
  <caption:Cues>
    Split each Script Segment into short complete semantic phrases of two to
    seven words. Never cross a sentence or Segment boundary.
  </caption:Cues>
  <caption:Field id="important" type="boolean" min-per-cue="1" max-per-cue="2">
    Select one or two words whose emphasis best communicates this Cue.
  </caption:Field>
</caption:Style>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `appearance` | yes | SVS caption Recipe — position, font, colors, container |
| `mode` | no | Caption timing mode, e.g. `proportional-word` |

**Children:**

- `<caption:Cues>` — natural-language instructions for the AI planner telling it how to split text
  into cues. The planner receives display text (left side of Dual Text) and these instructions, but
  never audio or timing data.
- `<caption:Field>` — declares a typed per-atom annotation. The planner assigns these fields to
  individual words within each cue.

| `<caption:Field>` attribute | Description |
|---|---|
| `id` | Field name (e.g. `important`) |
| `type` | Field type: `boolean` |
| `min-per-cue` | Minimum annotations per cue |
| `max-per-cue` | Maximum annotations per cue |

The element body of `<caption:Field>` is a natural-language instruction for the planner.

### caption:Program

Assigns caption styles to the narrative. Declares a default style and optional per-role or
per-Selection overrides.

```svml
<caption:Program id="caption-program" narrative={story} default={primary-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
  <caption:Use on={story.selection.product-demo} style={dialogue-caption}/>
</caption:Program>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `narrative` | yes | The Script component |
| `default` | yes | Default `caption:Style` for all text |

**Children:**

`<caption:Use>` applies style overrides. Rules are applied in source order — last match wins.

| `<caption:Use>` attribute | Description |
|---|---|
| `role` | Match by Role Cue label (e.g. `"ALICE"`) |
| `on` | Match by Selection reference (e.g. `{story.selection.product-demo}`) |
| `style` | The `caption:Style` to apply |

Use `role=` to give different speakers different caption colors. Use `on=` to override style during
specific Selections (e.g. a product demo section uses a different caption style).

### caption-ai:Planner

AI-driven cue planning via Gemini. The planner receives the display text atoms, the Style
instructions, and the Program assignments. It splits text into cues and assigns Field values.

```svml
<caption-ai:Planner id="caption-plan" narrative={story}
  program={caption-program} model="gemini-2.5-flash"/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `narrative` | yes | The Script component |
| `program` | yes | The `caption:Program` |
| `model` | yes | Gemini model: `gemini-2.5-flash` |

The planner never receives audio, timing data, or the speech side of Dual Text. It works entirely
from the caption (display) projection.

**Output:** `{caption-plan.plan}` — the cue plan, passed to `caption:Track`.

### caption:Track

Joins the cue plan, SemanticMap, ProgramSpace, and Program to produce a timed VisualTrack.

```svml
<caption:Track id="captions" narrative={story} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `narrative` | yes | The Script component |
| `map` | yes | SemanticMap from `whisperx:Alignment` |
| `space` | yes | ProgramSpace from `speech:Spine` |
| `program` | yes | The `caption:Program` |
| `plan` | yes | Cue plan from `caption-ai:Planner` |

**Output:** `{captions.track}` — a VisualTrack added to `film:Film`.

### Caption combination example

The full caption pipeline with per-role styles:

```svml
<caption:Style id="dialogue-caption" appearance={studio.caption.dialogue}>
  <caption:Cues>Use short complete semantic phrases, two to five words.</caption:Cues>
</caption:Style>

<caption:Style id="alice-caption" appearance={studio.caption.alice}>
  <caption:Cues>Use short complete semantic phrases, two to five words.</caption:Cues>
  <caption:Field id="important" type="boolean" min-per-cue="0" max-per-cue="2">
    Select at most two words whose emphasis best communicates this Cue.
  </caption:Field>
</caption:Style>

<caption:Style id="bob-caption" appearance={studio.caption.bob}>
  <caption:Cues>Use short complete semantic phrases, two to five words.</caption:Cues>
</caption:Style>

<caption:Program id="caption-program" narrative={story} default={dialogue-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
  <caption:Use on={story.selection.product-demo} style={dialogue-caption}/>
</caption:Program>

<caption-ai:Planner id="caption-plan" narrative={story}
  program={caption-program} model="gemini-2.5-flash"/>

<caption:Track id="captions" narrative={story} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

ALICE gets green captions (`#73FBD3`), BOB gets gold (`#FFD166`), and during the product-demo
Selection both switch to the neutral dialogue style. The `important` Field only applies to ALICE's
style — her emphasized words get special treatment.

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
<text:Track id="titles" space={speech.space}>
  <text:Item text="EDIT MEANING, NOT TIMELINES" during="full"
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
<text:Item text="MEANING" during="full" appearance={studio.text.title}/>
```

| Attribute | Required | Description |
|---|---|---|
| `text` | yes | The text string to display |
| `during` | yes | When to show: `"full"` (entire program) or a Selection reference |
| `appearance` | yes | SVS text Recipe — position, font, size, color |

The `during` attribute accepts either the literal string `"full"` for the entire program duration, or
a Selection reference for semantic timing:

```svml
<text:Track id="callout" space={speech.space} map={timing.map}>
  <text:Item text="EXACTLY THE RIGHT MOMENT"
    during={story.selection.callout}
    appearance={studio.text.callout}/>
</text:Track>
```

**Output:** `{titles.track}` — a VisualTrack added to `film:Film`.

## Combination example

All three track types together in one source file:

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="broll" from="@narratage/broll@1"/>
<import as="text" from="@narratage/text-track@1"/>

<!-- Captions: primary style for all text -->
<caption:Style id="base-caption" appearance={studio.caption.base}>
  <caption:Cues>Prefer short complete semantic phrases.</caption:Cues>
  <caption:Field id="important" type="boolean" min-per-cue="0" max-per-cue="2">
    Select zero, one, or two words whose emphasis best communicates this Cue.
  </caption:Field>
</caption:Style>
<caption:Program id="caption-program" narrative={story} default={base-caption}/>
<caption-ai:Planner id="cue-plan" narrative={story}
  program={caption-program} model="gemini-2.5-flash"/>
<caption:Track id="captions" narrative={story} map={timing.map}
  space={speech.space} plan={cue-plan.plan} program={caption-program}/>

<!-- B-roll: generated video during a Selection -->
<broll:Track id="cards" map={timing.map} space={speech.space}>
  <broll:Item source={motion.video} during={story.selection.demo}
    appearance={studio.broll.card}/>
</broll:Track>

<!-- Text: persistent title overlay -->
<text:Track id="titles" space={speech.space}>
  <text:Item text="MEANING" during="full" appearance={studio.text.title}/>
</text:Track>

<!-- All three tracks feed into Film -->
<film:Film id="main" space={speech.space} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audioTrack}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
  <film:Track source={titles.track}/>
</film:Film>
```

The `stack-order` in each SVS Recipe determines z-ordering: speech visual at 10, B-roll at 40,
captions at 70, text at 90. Higher values render on top.
