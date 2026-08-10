---
title: Caption, Media & Typography
description: Visual track components — captions, media overlays and typography overlays.
---

# Caption, Media & Typography

Every audiovisual contribution entering the final composition is a peer **Track**. Tracks are flat
(no nesting), and their z-order is determined by the `stack-order` property in SVS. This page
covers three official visual Track packages: captions, media, and typography overlays.

## Caption system

Caption uses a small common language and a replaceable Style family:

```text
Script Display → Caption Program → Planner + measured Atom timing → Style-family Track
```

```svml
<import as="caption" from="@narratage/caption@1"/>
<import as="caption-fine" from="@narratage/caption-fine@1"/>
<import as="caption-ai" from="@narratage/caption-gemini@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
```

`@narratage/caption` owns only common Cue bounds, generic optional per-Word fields, total Style
assignment, Plan validation and the timing join. `@narratage/caption-fine` is one field-free Style
family: it owns geometry, glyph/Cue/Pill Paint and layered local motion.

### caption-fine:Style

A Style is one indivisible pair of planning requirements and rendering parameters. Fine resolves
both from one package-owned SVS Recipe:

```svml
<fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal"/>
<caption-fine:Style id="primary-caption" recipe={studio.caption.primary}
  font={caption-fonts}/>
```

The required `font=` edge carries one byte-reproducible `FontStackRef`. Fine rejects a Style
without that stack instead of falling back to machine fonts.

### caption:Program

The Program starts from the complete ordered display-word universe emitted by Script. One explicit
default Style covers every word.

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

The planner receives immutable display Atoms/Words and already-resolved Style runs. It may only cut
each run between whole Atoms and attach declared fields to Word ids. Fine declares no fields.

### caption-fine:Track

```svml
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} map={timing.map}
  space={speech.space} program={caption-program} plan={caption-plan.plan}/>
```

The common Caption timing step joins the Plan to the independent SemanticMap. Fine then renders all
default and override Styles into one ordinary peer `VisualTrack`: `{captions.track}`.

## Media overlays

One Item can place a normalized image, video, animation or compositable Surface at a semantic or
absolute window.

```svml
<import as="pipeline" from="@narratage/media-pipeline@1"/>
<import as="media-track" from="@narratage/media-track@1"/>
```

### media-track:Track and media-track:Item

Placement is an explicit Spatial Frame edge; appearance and motion remain reusable SVS values.

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

The same Item model covers full-canvas cutaways, split screens and corner overlays.

**Outputs:** `{product-broll.visual}` and, only when explicitly authored, `{product-broll.audio}`.

## Text overlays

Static or timed text displayed on screen — titles, callouts, lower thirds.

```svml
<import as="text" from="@narratage/typography-track@1"/>
```

### text:Track

Container for text items.

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

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `space` | yes | ProgramSpace from `speech:Spine` |
| `map` | no | SemanticMap — needed when items use Selection-based timing |

### text:Area

Places flowing text inside a `SpatialFrame`:

```svml
<text:Area id="meaning" placement={title-frame} style={title-style} during="program">
  MEANING
</text:Area>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Stable item identity |
| child content or `content` | yes | Inline plain/rich content, or an ordinary graph `Text` reference |
| `during` | yes | `"program"` or a Selection reference |
| `placement` | yes | A `SpatialFrame` |
| `style` | yes | A `text:Style` compiled from an SVS Recipe plus exact font bytes |

**Output:** `{titles.track}` — a VisualTrack added to `film:Film`.

## Combination example

All three track types together:

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

The `stack-order` in each SVS Recipe determines z-ordering: speech visual at 10, media at 40,
captions at 70, text at 90. Higher values render on top.
