---
title: Tracks
description: Peer track components — captions, media, typography and authored audio.
---

# Tracks

Every audiovisual contribution entering the final composition is a peer **Track**. Tracks are flat
(no nesting), and visual z-order is determined by the `stack-order` property in SVS. This page
covers Caption, Media, Typography and Audio Track authoring.

## Caption system

Caption uses a small common language and a replaceable Style family:

```text
Script Display → Caption Program → Planner + measured Atom timing → Style-family Track
```

```svml
<import as="caption" from="@hypit/caption@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>
<import as="caption-ai" from="@hypit/caption-gemini@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="fonts" from="@hypit/fonts-open@1"/>
```

`@hypit/caption` owns only common Cue bounds, generic optional per-Word fields, total Style
assignment, Plan validation and the timing join. `@hypit/caption-fine` is one field-free Style
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
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} semantic={speech.semantic} program={caption-program} plan={caption-plan.plan}/>
```

The common Caption timing step joins the Plan to the independent SemanticMap. Fine then renders all
default and override Styles into one ordinary peer `VisualTrack`: `{captions.track}`.

## Media overlays and B-roll

B-roll is an editorial use of the generic Media Track, not a separate Track family. One Item can
place an image, generated video, prepared timed medium or compositable Surface at a semantic or
absolute window.

```svml
<import as="media-track" from="@hypit/media-track@1"/>
<import as="wording" from="@hypit/text@1"/>
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
  left="8%" top="20%" right="92%" bottom="68%"/>

<media-track:Track id="product-broll" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item video={product-motion.video} frame={product-frame}
    during={story.selection.product-demo}
    appearance={studio.media.product}
    motion={studio.motion.product}/>
</media-track:Track>
```

`left`, `top`, `right` and `bottom` are edge coordinates inside the parent Frame; `right` and
`bottom` are not CSS-style margins. A Frame covering the middle 84% of the canvas horizontally is
`left="8%" right="92%"`, and `right="8%"` would place its right edge to the left of its left edge,
which is rejected. The Selection contributes semantic points; Media performs the package-owned
window projection.
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

`@hypit/audio-track` places explicitly prepared audio on the same ProgramSpace as the visual
Tracks. A `Clip` consumes `SynchronizedMedia`; normalize a declared or generated audio Blob first,
then choose its exact program window and occupancy:

```svml
<import as="media" from="@hypit/media@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="audio" from="@hypit/audio-track@1"/>

<media:Audio id="music" src="./assets/music.wav"/>
<pipeline:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>

<audio:Track id="music-bed" semantic={speech.semantic}>
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
<import as="text" from="@hypit/typography-track@1"/>
<import as="wording" from="@hypit/text@1"/>
```

### text:Track

Container for text items.

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="94%" bottom="16%"/>
<fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={studio.text.title} font={title-font}/>
<text:Track id="titles" semantic={speech.semantic}>
  <text:Area id="title" placement={title-frame} style={title-style} during="program">
    EDIT MEANING, NOT TIMELINES
  </text:Area>
</text:Track>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `space` | yes | ProgramSpace from `speech:Track` |
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
<text:Track id="callout" semantic={speech.semantic}>
  <text:Area id="callout-copy" placement={callout-frame}
    style={callout-style} during={story.selection.callout}>
    EXACTLY THE RIGHT MOMENT
  </text:Area>
</text:Track>
```

Graph-produced copy remains visible as an edge:

```svml
<wording:Value id="headline">EXACTLY THE RIGHT MOMENT</wording:Value>
<text:Track id="callout" semantic={speech.semantic}>
  <text:Area id="callout-copy" content={headline}
    placement={callout-frame} style={callout-style} during="program"/>
</text:Track>
```

The generic Text value supplies only characters. Typography still owns the item document wrapper,
placement, timing, style and motion. Use inline `P`/`Span`/`Break` when the author needs rich runs.

**Output:** `{titles.track}` — a VisualTrack added to `film:Film`.

## Ranking boards

A board animates an ordered list against the Script: it enters on a Selection, moves on Moments, and
settles on a Moment that ends it. Three variants share one shape — a container, its own item tag,
and its own style tag.

| Container | Item | Style |
|---|---|---|
| `ranking:TierBoard` | `ranking:TierItem` | `ranking:TierBoardStyle` |
| `ranking:Column` | `ranking:ColumnItem` | `ranking:ColumnStyle` |
| `ranking:TopThree` | `ranking:TopThreeItem` | `ranking:TopThreeStyle` |

```svml
<import as="ranking" from="@hypit/ranking@1"/>
```

### The style tag

Empty, and all three attributes required: `id`, `recipe` (an SVS Recipe) and `font` (a Font Stack or
Font artifact). The recipe carries the board's own keys — rows, colours, motion — and is validated
against the variant, so a Column recipe on a TierBoard is refused by name.

### The container tag

| Attribute | Takes |
|---|---|
| `map` | the Semantic Map that places words |
| `space` | the Program Space |
| `frame` | a `space:Frame` |
| `during` | a Selection — the board is on screen for it |
| `triggers` | a Moment — rows move on it |
| `terminal` | a Moment — the board settles on it |
| `style` | the matching style record, and only that variant's |
| `appear-sound`, `move-sound` | optional Synchronized Media |

`move-sound` is refused on `TopThree`, which has no move phase. On a `TierBoard` it needs at least
one item with `entry="stage"` — a sound with nothing to sound on is an authoring mistake, not a
silent no-op.

### The item tags

Each variant takes its own, at least one, and ids must be unique within a board.

- **`TierItem`** — `tier` (required, matching a row id in the recipe), `icon` (required), optional
  `entry="direct" | "stage"` and `stack`. Row labels come from the recipe, not the tag.
- **`ColumnItem`** and **`TopThreeItem`** — `label` (required: a string or a Text reference), optional
  `icon` and `stack`. `TopThree` takes at most three.

```svml
<ranking:ColumnStyle id="board-style" recipe={studio.ranking.board} font={ui-font}/>
<ranking:Column id="board" semantic={speech.semantic} frame={board-frame}
  during={story.selection.board} triggers={story.moment.place} terminal={story.moment.done}
  style={board-style}>
  <ranking:ColumnItem id="row-regen" label="ReGen" icon={icon-regen}/>
  <ranking:ColumnItem id="row-chatgpt" label="ChatGPT" icon={icon-chatgpt}/>
  <ranking:ColumnItem id="row-remini" label="Remini" icon={icon-remini}/>
</ranking:Column>
```

**Output:** `{board.visual}` — a VisualTrack. A board given a sound also exports `{board.audio}`, an
AudioTrack; without one there is no audio output to add.

## Card decks

A deck holds cards in depth: one is in front, the others recede behind it, and each new card is dealt
on a Moment. Where a Media Item places one shot in one Frame, a deck keeps a stack of them in the
same Frame and moves the whole stack.

```svml
<import as="deck" from="@hypit/deck-track@1"/>
```

### deck:DepthStack

`id`, `map`, `space`, `canvas`, `frame` and `appearance` are all required, as is `until`, which says
what ends the deck: the literal `"program.end"`, a Moment, or a Selection. Only with a Selection may
you add `until-boundary="start" | "end"` to choose which edge of it ends the deck; the default is
`end`, and giving the attribute in the other two cases is refused rather than ignored.

### deck:Card

A direct child of the stack, self-closing, at least one, and dealt in document order.

| Attribute | Takes |
|---|---|
| `source` | required — a still image, a Synchronized Medium, or a Compositable Surface |
| `extent` | required for a still image and refused for anything else |
| `at` | required — the Moment the card is dealt on |
| `appearance` | optional — its own Recipe, otherwise the stack's |
| `label` | optional — a `deck:Label` record |

### deck:Label

`id` and `font` are required. The copy is either the `content=` reference or the element's own text —
give both and it is refused. `size`, `color`, `align`, `block` and `padding` are optional.

```svml
<space:Frame id="deck-frame" within={vertical} left="44%" top="60%" right="98%" bottom="88%"/>
<deck:DepthStack id="deck" semantic={speech.semantic} canvas={vertical}
  frame={deck-frame} appearance={studio.deck.stack} until={story.moment.done}>
  <deck:Card id="card-spatial" source={icon-spatial} extent={square} at={story.moment.deal-one}/>
  <deck:Card id="card-type" source={icon-type} extent={square} at={story.moment.deal-two}/>
</deck:DepthStack>
```

**Output:** `{deck.track}` — a VisualTrack, an ordinary peer of every other Track in the Film.

## Screen overlays

Effects that cover the picture rather than sit in a Frame: a flash on a cut, a vignette that holds
for a Selection, grain over the whole programme. One Track carries them all, and each child is one
effect bound to its own window.

```svml
<import as="screen" from="@hypit/screen-overlay@1"/>
```

`screen:Track` takes `id`, `canvas` and `space`. Its children are the effects, at least one, each
empty, each with a required `z` for stacking order and a window that is one of:

| Window | Written |
|---|---|
| The whole programme | `during="program"` |
| A Selection | `during={story.selection.x}` on an item whose Track has `semantic={speech.semantic}` |
| A Moment, for a length | `at={story.moment.x} for="12f"` on an item whose Track has `semantic={speech.semantic}` |
| An explicit span | `start="…" end="…"`, optionally against a `selection=` or `moment=` |

Anything bound to the Script needs `map`; an explicit span with no Script source must not have one.
Lengths are `12f`, `250ms` or `1.5s`, and `occurrences="each"` repeats an effect at every occurrence
of its marker rather than the first.

Eleven effects are available — `Flash`, `ColorWash`, `Vignette`, `ScanLines`, `DirectionalMatte`,
`WhipVeil`, `GlitchVeil`, `Grain`, `LightLeak`, `Bokeh` and `TVStatic` — and each carries its own
required attributes, such as `color` / `intensity` / `attack` / `hold` / `decay` on a `Flash`, or
`center-x` / `center-y` / `radius-x` / `radius-y` / `softness` / `color` / `opacity` on a `Vignette`.
None have defaults: an effect states its whole shape or is refused.

```svml
<screen:Track id="effects" semantic={speech.semantic} canvas={vertical}>
  <screen:Flash during={story.selection.overlay} z="80"
    color="#ffffff" intensity="0.6" attack="2" hold="2" decay="6"/>
</screen:Track>
```

**Output:** `{effects.track}` — a VisualTrack.

## Comment stickers

Social-style comment cards placed in a Frame: an avatar, an author, the comment itself, and an
optional metadata line.

```svml
<import as="comment" from="@hypit/comment-sticker@1"/>
```

`comment:Style` is empty and takes `id`, `recipe` and `font`, all required. The recipe carries the
card's whole appearance — background, border, radius, tail, avatar, the three text rows, and the
enter/hold/exit motion — and every key has a default, so a recipe may set only what it changes.

`comment:Track` takes `id`, `canvas` and `space`. It takes `map` only if one of its stickers binds to
the Script, and giving `map` when none does is refused rather than ignored.

`comment:Sticker` requires `id`, `frame` and `style`, and takes the same windows as a screen overlay
above. Its copy is either the `comment=` attribute or the element's own text — both is refused. The
optional `author`, `header` and `meta` each take a string or a Text reference, `avatar` takes an
image, and there is no `z`: stacking order comes from the recipe's `stack-order`.

```svml
<comment:Style id="social" recipe={studio.comment} font={ui-font}/>
<comment:Track id="comments" canvas={vertical} semantic={speech.semantic}>
  <comment:Sticker id="one" frame={comment-frame} style={social} avatar={viewer-avatar}
    author="@viewer" meta="Featured" during={story.selection.reaction}>
    Wait, it pinned the caption to the word, not the second.
  </comment:Sticker>
</comment:Track>
```

**Output:** `{comments.track}` — a VisualTrack.

## Combination example

All four track families together in one source file:

```svml
<import as="caption" from="@hypit/caption@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>
<import as="caption-ai" from="@hypit/caption-gemini@1"/>
<import as="fonts" from="@hypit/fonts-open@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="media-track" from="@hypit/media-track@1"/>
<import as="text" from="@hypit/typography-track@1"/>
<import as="audio" from="@hypit/audio-track@1"/>
<import as="space" from="@hypit/spatial@1"/>

<!-- Captions: primary style for all text -->
<fonts:Stack id="caption-font" family="inter" weight="700" style="normal"/>
<fonts:Stack id="title-font" family="inter" weight="900" style="normal"/>
<caption-fine:Style id="base-caption" recipe={studio.caption.base} font={caption-font}/>
<caption:Program id="caption-program" display={story.caption} default={base-caption}/>
<caption-ai:Planner id="cue-plan" display={story.caption}
  program={caption-program} model="gemini-2.5-flash"/>
<caption-fine:Track id="captions" display={story.caption} correspondence={story.caption.correspondence} semantic={speech.semantic} plan={cue-plan.plan} program={caption-program}/>

<!-- Shared placement is an explicit edge, separate from Text appearance. -->
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical}
  left="6%" top="6%" right="94%" bottom="16%"/>
<space:Frame id="card-frame" within={vertical}
  left="10%" top="20%" right="90%" bottom="70%"/>

<!-- Media: one ordinary Item used editorially as B-roll -->
<media-track:Track id="cards" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item video={motion.video} frame={card-frame}
    during={story.selection.demo} appearance={studio.media.card} motion={studio.motion.card}/>
</media-track:Track>

<!-- Text: persistent title overlay -->
<text:Style id="title-style" recipe={studio.text.title} font={title-font}/>
<text:Track id="titles" semantic={speech.semantic}>
  <text:Area id="meaning" placement={title-frame} style={title-style} during="program">
    MEANING
  </text:Area>
</text:Track>

<!-- Audio: normalize one declared source, then place it for the complete program -->
<media:Audio id="music" src="./assets/music.wav"/>
<pipeline:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>
<audio:Track id="music-bed" semantic={speech.semantic}>
  <audio:Clip source={music-media.media} during="program"
    playback="loop-end" gain="0.28" fade-in="600ms" fade-out="800ms"/>
</audio:Track>

<!-- All peer tracks feed into Film -->
<film:Film id="main" canvas={vertical} semantic={speech.semantic} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audio}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
  <film:Track source={titles.track}/>
  <film:Track source={music-bed.track}/>
</film:Film>
```

The `stack-order` in each SVS Recipe determines z-ordering: speech visual at 10, media at 40,
captions at 70, text at 90. Higher values render on top.
