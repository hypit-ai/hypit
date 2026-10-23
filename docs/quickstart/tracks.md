---
title: Tracks
description: Peer track components — captions, media, typography and authored audio.
---

Every audiovisual contribution entering the final composition is a peer **Track**. A Track is a
closed contribution rather than a container for other Tracks. Film may recursively group visual
Tracks in a Stack when their composite must be treated as one picture. The parent Film or Stack
owns each visual occurrence's `id` and its position in the sibling sequence; the reusable Track value
retains only its local programme. This page covers Caption, Media, Typography and Audio Track authoring.

## Caption system

Caption uses a source-neutral document produced by Script and a replaceable Style family:

```text
Script → CaptionDocument + NarrativeCaptionBinding
Binding + NarrativeProjection → complete Unit CaptionTiming
authored Cues + CaptionTiming + Uses → family presentation schedule → VisualTrack
```

```svml
<import as="caption" from="@hypit/caption@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="fonts" from="@hypit/fontsource@1"/>
```

`@hypit/caption` owns the common CaptionDocument contract, including ordered Words, correspondence
Units and authored Cues, plus complete-unit Selection/Role queries, Style assignment and the flat
timing join. `@hypit/caption-fine` is one Style family: it presents those Cues and owns their
geometry, glyph/Cue/Pill Paint and layered local motion.

### caption-fine:Style

A Style is a rendering intent resolved from one package-owned SVS Recipe:

```svs
caption.primary {
 x: 0.5; y: 0.88; width: 0.84;
  height: 0.22;
  anchor-x: center; anchor-y: bottom;
  size: 58;
  line-height: 0.96; letter-spacing: -0.5; word-gap: 14;
  align: center; block-align: end; inline-size: fixed;
  wrap: word; max-lines: 2; max-words-per-line: 4;
  direction: ltr;
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
  cue-enter: spring; cue-enter-frames: 4;
  cue-enter-start-scale: 0.75;
  cue-exit: none; cue-exit-frames: 0;
  atom-reveal: all;
  active-response: pop; active-response-frames: 5; active-scale: 1.08;
  lead-frames: 4; tail-frames: 4; handoff: cut;
}
```

```svml
<fonts:Face id="caption-latin" package="@fontsource-variable/inter" weight="700" style="normal"/>
<fonts:Face id="caption-han" package="@fontsource-variable/noto-sans-sc" weight="700" style="normal"/>
<media:FontStack id="caption-fonts" primary={caption-latin}>
  <media:Fallback font={caption-han}/>
</media:FontStack>
<caption-fine:Style id="primary-caption" recipe={recipes.caption.primary}
  font={caption-fonts}/>
```

The required `font=` edge carries one byte-reproducible `FontStackRef`. Family, weight and style
exist only on that edge; each fallback retains its own exact face metadata. Fine rejects a Style
without that stack instead of falling back to machine fonts.

Another Caption package may define a different rendering family without changing the common
CaptionDocument contract.

Fine's properties are orthogonal: normalized placement and anchor; layout and
typography; base/active solid or gradient glyph Paint; stroke, shadow, directional long shadow,
glow and underline; Cue/Pill Paint; three independent glyph/Pill/underline activation channels;
and layered Cue, Alignment-Unit, active-response and loop motion. Missing optional dimensions resolve
deterministically to no decoration or motion. Unknown properties are rejected.

The package groups those properties as **Where**, **How** and **When** in its Surface declaration,
so Studio can present the same author contract without maintaining a Caption-specific property list.
`lead-frames` and `tail-frames` form an explicit visible Schedule around the spoken Cue;
`handoff: cut` prevents adjacent visible envelopes from competing, while `overlap` preserves both.
Neither form changes the Word frames used by Karaoke.

`karaoke` is `off`, `current` or `trail`; `karaoke-transition` is `step` or `wipe`. Timing is always
whole-Alignment-Unit timing already proven by Caption. A normal one-word unit therefore highlights
per word, while a Dual Text unit remains one indivisible visible unit. Fine never guesses internal
time.

`active-box` is independently `off`, `current` or `trail`. `active-box-continuity: isolated` paints
one capsule per activated Alignment Unit; `joined` turns a trail into one ordered prefix whose background is
continuous on each real browser line. Thus trail-colored text with a current-only Pill is one
Recipe—not a second renderer.

With `wrap: word`, Fine wraps between complete Alignment Units and falls back inside a single
over-wide display unit so it cannot escape the Region. `max-words-per-line` constructs explicit rows;
when `max-lines` is present, a Cue that would construct more rows is rejected instead of having its
text or Paint clipped. Cue boundaries come from Script segments, turns and authored
`||`.

Fine is the uniform-flow family: every token follows the same Recipe and may differ only by time,
index or play state. A Cue with authored internal roles—different font/layout groups, full-frame
inversion, tearing or cross-clause composition—requires another Caption package rather than a hidden
Fine exception.

CJK dialogue can be written directly. For a display-only emoji that still follows speech timing,
author the correspondence explicitly, such as `<🌐 | globe>`; the system will not invent a spoken
word for a bare symbol.

### caption-fine:Caption

Caption content comes from Script and Timeline. Uses choose presentation in time; later Uses replace earlier treatments inside their windows, including Hidden.

```svml
<caption:Hidden id="hidden"/>
<narrative-caption:Timing id="story-captions" document={story.caption}
  binding={story.caption-binding} projection={story-time}/>
<caption-fine:Caption id="captions" document={story.caption} timing={story-captions}
  timeline={speech.timeline} within={vertical.bounds}>
  <caption-fine:Use style={primary-caption}/>
  <caption-fine:Use role="ALICE" style={alice-caption}/>
  <caption-fine:Use role="BOB" style={bob-caption}/>
  <caption-fine:Use during={product-demo-window} style={dialogue-caption}/>
  <caption-fine:Use during={private-window} style={hidden}/>
</caption-fine:Caption>
```

`||` organizes Cues. A window can start inside a Cue while retaining its complete text and original
word timing. `role` filters the speaker independently of time. A timed Use names an already resolved
absolute Window through `during`.

## Visual Clips and B-roll

B-roll is an editorial use of a Visual Clip, not a separate Track family. One Clip can
place an image, generated video, prepared timed medium or compositable Surface at a semantic or
absolute window.

```svml
<import as="visual" from="@hypit/visual-track@1"/>
<import as="time" from="@hypit/timeline-author@1"/>
<import as="wording" from="@hypit/text@1"/>
<time:Clock id="clock" frame-rate="30"/>
```

### visual:Track and visual:Clip

Placement is an explicit Spatial Frame edge. Fit, source-time mapping and stack order belong directly
to the occurrence; reusable pixel treatment and typed Motion remain optional values.

```svml
<wording:Value id="product-direction">
  A clean vertical product film: the written script becomes semantic regions,
  then those regions assemble into a finished video.
</wording:Value>

<seedance:ReferenceVideo id="product-motion" model="mini"
  prompt={product-direction} duration="5">
  <seedance:Reference image={product-reference} person-reference="false"/>
</seedance:ReferenceVideo>

<space:Frame id="product-frame" within={vertical.bounds}
  left="8%" top="20%" right="92%" bottom="68%"/>

<mediaop:Normalize id="product-media" source={product-motion.video}
  video="primary-moving" audio="none" span-authority="video" clock={clock}/>

<visual:Motion id="product-motion-in">
  <visual:Pose at="start" y="80" opacity="0" easing="ease-out"/>
  <visual:Pose at="8f" y="0" opacity="1"/>
  <visual:Pose at="end" y="0" opacity="1"/>
</visual:Motion>

<visual:Track id="product-broll" timeline={speech.timeline}>
  <visual:Clip media={product-media.media} frame={product-frame}
    during={product-demo} fit="contain"
    treatment={recipes.visual.product} motion={product-motion-in}>
    <visual:Map/>
  </visual:Clip>
</visual:Track>
```

`left`, `top`, `right` and `bottom` are edge coordinates inside the parent Frame; `right` and
`bottom` are not CSS-style margins. A Frame covering the middle 84% of the canvas horizontally is
`left="8%" right="92%"`, and `right="8%"` would place its right edge to the left of its left edge,
which is rejected. A Narrative projection may publish `product-demo` upstream; Visual Track
only consumes the resulting Window.
Fit is the common constructor for the Clip's source-to-picture `SpatialMap2D`; the resolved Program
stores the map rather than a second content rectangle. When a component or source-local evidence
already owns the exact affine relation, declare a `<space:Map>` and pass it through `mapping={...}`
instead of all fit attributes. The Clip's `frame` still independently controls clipping and Frame
treatment.
The same Clip model also covers full-canvas cutaways, split screens and corner overlays. A public
Clip has one source. Relationships spanning several sources or Clips belong to a component rather
than a built-in Sequence grammar.

Every direct Clip or sample Layer declares exactly one visual input form:

| Input | Value | Meaning |
|---|---|---|
| `image={...}` + `extent={...}` | Blob + authored pixel extent | A durationless still image |
| `media={...}` | `SynchronizedMedia` | Connect an explicitly prepared timed source directly |
| `surface={...}` | `CompositableSurfaceRef` | Connect an alpha-aware still or timed surface directly |

A generated or imported video Blob reaches a Track through `<mediaop:Normalize>`, which inspects it,
selects its streams and puts them on one frame domain; its `.media` output is what `media=` connects
to. `audio="none"` carries the picture alone, and `audio="default"` carries the source's own sound,
which `audio-gain` then scales. These forms are explicit so a generic Blob is never guessed to be an
image or a video.

**Outputs:** `{product-broll.program}` and `{product-broll.visual}`. Audio is always authored on an
Audio Track; connecting synchronized media here never selects its audio member.

## Audio tracks

`@hypit/audio-track` places explicitly prepared audio on the same Timeline as the visual
Tracks. A `Clip` consumes `SynchronizedMedia`; normalize a declared or generated audio Blob first,
then choose its exact program Window and source-time relation:

```svml
<import as="media" from="@hypit/media@1"/>
<import as="mediaop" from="@hypit/media-operations@1"/>
<import as="audio" from="@hypit/audio-track@1"/>
<import as="time" from="@hypit/timeline-author@1"/>

<time:Clock id="clock" frame-rate="30"/>
<media:Audio id="music" src="./assets/music.wav"/>
<mediaop:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" clock={clock}/>

<audio:Track id="music-bed" timeline={speech.timeline}>
  <audio:Clip source={music-media.media} during={speech.window}
    gain="0.28" fade-in="600ms" fade-out="800ms">
    <audio:Map target-at="end" source-at="end" rate="1"
      wrap-from="start" wrap-until="end"/>
  </audio:Clip>
</audio:Track>
```

| Attribute | Required | Description |
|---|---|---|
| `Track.id` | yes | Stable Audio Track identity |
| `Track.timeline` | yes | Timeline that defines the exact sample and frame domain |
| `Clip.source` | yes | Explicitly selected and normalized `SynchronizedMedia` |
| `during` | yes | A named absolute Window |
| `source-time` or `Map` children | no | Reusable or inline partial target-to-source relation; omission is bounded partial identity |
| `gain`, `fade-in`, `fade-out` | no | Explicit per-Clip mix values |

The package performs no automatic extraction, normalization, ducking, or bus routing. Multiple
Clips in one Track and multiple peer Audio Tracks remain independent inputs to Film. The output is
`{music-bed.audio}`, an ordinary `AudioTrack`.

To apply explicit gain and close several AudioTracks into one contribution, use Audio Mix:

```svml
<import as="mix" from="@hypit/audio-mix@1"/>
<mix:Track id="dialogue" timeline={speech.timeline}>
  <mix:Input id="host" source={host.audio}/>
  <mix:Input id="guest" source={guest.audio} gain="0.9"/>
</mix:Track>
```

The output `{dialogue.audio}` is another ordinary AudioTrack. Film sees only that closed output;
Audio Mix does not normalize, limit, invent a Master, or route by Track name.

## Text overlays

Static or timed text displayed on screen — titles, callouts, lower thirds.

```svml
<import as="text" from="@hypit/text-fine@1"/>
<import as="wording" from="@hypit/text@1"/>
```

### text:Flow, text:Point and text:Path

Fine text does not have an aggregate container. Each independently authored title, label or short
piece of editorial copy is one occurrence and one ordinary VisualTrack contribution.

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="title-frame" within={vertical.bounds}
  left="6%" top="6%" right="94%" bottom="16%"/>
<fonts:Face id="title-font" package="@fontsource-variable/inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
<text:Flow id="title" timeline={speech.timeline} within={title-frame}
  style={title-style} align="center" during={speech.window}>
  EDIT MEANING, NOT TIMELINES
</text:Flow>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `timeline` | yes | Absolute Timeline that owns the occurrence window |
| `during` | yes | A named absolute Window |
| `within`, `point`, or `path` | yes | Placement matching `Flow`, `Point`, or `Path` |
| `style` | yes | Style compiled from an SVS Recipe plus exact font bytes |
| form layout | no | `Flow` alignment/wrapping, `Point` anchors or `Path` margins and direction, written only on the matching occurrence |

Each occurrence has one explicit placement form, one exact Style and one absolute time expression.
`Flow` places flowing text inside a `SpatialFrame`:

```svml
<text:Flow id="meaning" timeline={speech.timeline} within={title-frame}
  style={title-style} align="center" during={speech.window}>
  MEANING
</text:Flow>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Stable item identity |
| child content or `content` | yes | Inline plain/rich content, or an ordinary graph `Text` reference; the two forms are exclusive |
| timing | yes | `during={named-window}` |
| placement | yes | `SpatialPoint`, `SpatialFrame` or `SpatialPath`, matching the occurrence form |
| `style` | yes | A `text:Style` compiled from an SVS Recipe plus exact font bytes |
| form layout | no | Direct layout attributes declared by the selected `Flow`, `Point` or `Path` form |

`speech.window` covers the complete Timeline. An authored Timeline Window or an upstream semantic,
beat or other projection can supply any other ordinary absolute Window. The fine-text component
does not know which domain produced it:

```svml
<text:Style id="callout-style" recipe={recipes.text.callout} font={title-font}/>
<text:Flow id="callout-copy" timeline={speech.timeline} within={callout-frame}
  style={callout-style} during={program.callout}>
  EXACTLY THE RIGHT MOMENT
</text:Flow>
```

Graph-produced copy remains visible as an edge:

```svml
<wording:Value id="headline">EXACTLY THE RIGHT MOMENT</wording:Value>
<text:Flow id="callout-copy" timeline={speech.timeline} content={headline}
  within={callout-frame} style={callout-style} during={speech.window}/>
```

The generic Text value supplies only characters. Typography still owns the item document wrapper,
placement, timing, style and motion. Use inline `P`/`Span`/`Break` when the author needs rich runs.

Each occurrence publishes `{callout-copy.occurrence}` for sibling text tools and
`{callout-copy.visual}` for `film:Film`. Several unrelated titles remain several explicit Film
inputs; coordination between them belongs in a project component, not an accidental text collection.

## Ranking boards

A ranking board animates an ordered list against the Script. The concrete container, item and Style
vocabulary is package-owned. Ranking, Depth Stack and Comment Sticker are optional packages, not
part of the default Hypit installation. Add the selected published version to the video's ordinary
`package.json` and lockfile before importing it; inspect that installed package before authoring.

| Container | Item | Style |
|---|---|---|
| `ranking:Column` | `ranking:ColumnItem` | `ranking:ColumnStyle` |
| `ranking:TopThree` | `ranking:TopThreeItem` | `ranking:TopThreeStyle` |

```bash
npm install @hypit/ranking
```

```svml
<import as="ranking" from="@hypit/ranking@1"/>
```

### The style tag

Empty, and all three attributes required: `id`, `recipe` (an SVS Recipe) and `font` (a Font Stack or
Font artifact). The recipe is validated against the selected component variant; a Recipe from another
family is refused by name.

### The container tag

| Attribute | Takes |
|---|---|
| `timeline` | the absolute Timeline the board is timed against |
| `within` | a `space:Frame` when the selected board has an independent reveal or explanation stage |
| `frame` | a `space:Frame` — the board's declared placement |
| `during` | the timing form declared by the selected component |
| `style` | the matching style record, and only that variant's |
| `appear-sound`, `move-sound` | optional Synchronized Media |
| `terminal` | the absolute Instant where the completed board settles. `TopThree` only |

Use only the timing forms supported by the selected package; do not infer a terminal or reveal model
from another component family.

Optional sounds and reveal phases are valid only when the selected package declares them.

### The item tags

Each variant takes its own, at least one, and ids must be unique within a board.

- **`TopThreeItem`** — `label` and item-owned absolute Instant `at` are required; `icon` and `stack`
  are optional. At most three. TopThree reveal order comes from these Instants' actual frame order.
- **`ColumnItem`** — `label` (required) and `rank` (required, a positive integer that decides the
  numbered row and nothing else), optional `icon` and `stack`. Each item also owns its reveal time:
  `during` names the absolute Window when it prefers to appear, and
  `preset="true"` marks a row that starts already placed. Exactly one of the two — an item with
  neither, or with both, is refused by name.

```svml
<ranking:ColumnStyle id="board-style" recipe={recipes.ranking.board} font={ui-font}/>
<ranking:Column id="board" timeline={speech.timeline} within={vertical.bounds} frame={board-frame}
  during={board} style={board-style}>
  <ranking:ColumnItem id="row-regen" rank="1" label="ReGen" icon={icon-regen}
    during={regen-reveal}/>
  <ranking:ColumnItem id="row-chatgpt" rank="2" label="ChatGPT" icon={icon-chatgpt}
    during={chatgpt-reveal}/>
  <ranking:ColumnItem id="row-remini" rank="3" preset="true" label="Remini" icon={icon-remini}/>
</ranking:Column>
```

**Output:** `{board.visual}` — a VisualTrack. A board given a sound also exports `{board.audio}`, an
AudioTrack; without one there is no audio output to add.

## Card decks

A deck holds cards in depth: one is in front, the others recede behind it, and each new card is dealt
on an Instant. Where a Visual Clip places one shot in one Frame, a deck keeps a stack of them in the
same Frame and moves the whole stack.

```bash
npm install @hypit/depth-stack
```

```svml
<import as="deck" from="@hypit/depth-stack@1"/>
```

### deck:DepthStack

`id`, `timeline`, `within`, `frame`, `appearance` and `until` are required. `until` references a named
absolute Instant, whether it came from a Narrative Projection or a direct time declaration.

### deck:Card

A direct child of the stack, self-closing, at least one, and dealt in document order.

| Attribute | Takes |
|---|---|
| `source` | required — a still image, a Synchronized Medium, or a Compositable Surface |
| `extent` | required for a still image and refused for anything else |
| `at` | required — a named absolute reveal Instant |
| `appearance` | optional — its own Recipe, otherwise the stack's |
| `label` | optional — a `deck:Label` record |

### deck:Label

`id` and `font` are required. The copy is either the `content=` reference or the element's own text —
give both and it is refused. `size`, `color`, `align`, `block` and `padding` are optional.

```svml
<space:Frame id="deck-frame" within={vertical.bounds} left="44%" top="60%" right="98%" bottom="88%"/>
<deck:DepthStack id="deck" timeline={speech.timeline} within={vertical.bounds}
  frame={deck-frame} appearance={recipes.deck.stack} until={done}>
  <deck:Card id="card-spatial" source={icon-spatial} extent={square} at={deal-one}/>
  <deck:Card id="card-type" source={icon-type} extent={square} at={deal-two}/>
</deck:DepthStack>
```

**Output:** `{deck.visual}` — a VisualTrack, an ordinary peer of every other Track in the Film.

## Comment stickers

Social-style comment cards placed in a Frame: an avatar, an author, the comment itself, and an
optional metadata line.

```bash
npm install @hypit/comment-sticker
```

```svml
<import as="comment" from="@hypit/comment-sticker@1"/>
```

`comment:Style` is empty and takes `id`, `recipe` and `font`, all required. The recipe carries the
card's whole appearance — background, border, radius, tail, avatar, the three text rows, and the
enter/hold/exit motion — and every key has a default, so a recipe may set only what it changes.

`comment:Track` takes `id` and `timeline` for the complete work.

`comment:Sticker` requires `id`, `frame`, `style` and `during`, which references a named absolute
Window. Its copy is either the `comment=` attribute or the element's own text — both is refused. The
optional `author`, `header` and `meta` each take a string or a Text reference, `avatar` takes an
image, and there is no component-level `z`. Its optional `stack-order` Recipe value only orders
stickers inside this one Track; Film places the completed Track among peer visual contributions.

```svml
<comment:Style id="social" recipe={recipes.comment} font={ui-font}/>
<comment:Track id="comments" timeline={speech.timeline}>
  <comment:Sticker id="one" frame={comment-frame} style={social} avatar={viewer-avatar}
    author="@viewer" meta="Featured" during={reaction}>
    Wait, it pinned the caption to the word, not the second.
  </comment:Sticker>
</comment:Track>
```

**Output:** `{comments.visual}` — a VisualTrack.

## Combination example

All four track families together in one source file:

```svml
<import as="caption" from="@hypit/caption@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>
<import as="fonts" from="@hypit/fontsource@1"/>
<import as="media" from="@hypit/media@1"/>
<import as="mediaop" from="@hypit/media-operations@1"/>
<import as="visual" from="@hypit/visual-track@1"/>
<import as="text" from="@hypit/text-fine@1"/>
<import as="audio" from="@hypit/audio-track@1"/>
<import as="space" from="@hypit/spatial@1"/>
<import as="time" from="@hypit/timeline-author@1"/>

<time:Clock id="clock" frame-rate="30"/>

<!-- Captions: primary style for all text -->
<fonts:Face id="caption-font" package="@fontsource-variable/inter" weight="700" style="normal"/>
<fonts:Face id="title-font" package="@fontsource-variable/inter" weight="900" style="normal"/>
<caption-fine:Style id="base-caption" recipe={recipes.caption.base} font={caption-font}/>
<caption:Hidden id="hidden"/>

<caption-fine:Caption id="captions" document={story.caption} timing={story-captions}
  timeline={speech.timeline} within={vertical.bounds}>
    <caption-fine:Use style={base-caption}/>
  </caption-fine:Caption>

<!-- Shared placement is an explicit edge, separate from Text appearance. -->
<space:Canvas id="vertical" width="1080" height="1920"/>

<space:Frame id="title-frame" within={vertical.bounds}
  left="6%" top="6%" right="94%" bottom="16%"/>

<space:Frame id="card-frame" within={vertical.bounds}
  left="10%" top="20%" right="90%" bottom="70%"/>

<!-- Media: one ordinary Clip used editorially as B-roll -->
<mediaop:Normalize id="card-media" source={motion.video}
  video="primary-moving" audio="none" span-authority="video" clock={clock}/>
<visual:Track id="cards" timeline={speech.timeline}>
  <visual:Clip media={card-media.media} frame={card-frame}
    during={demo} fit="cover" treatment={recipes.visual.card}/>
</visual:Track>

<!-- Text: persistent title overlay -->
<text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
<text:Flow id="meaning" timeline={speech.timeline} within={title-frame}
  style={title-style} align="center" during={speech.window}>
  MEANING
</text:Flow>

<!-- Audio: normalize one declared source, then place it for the complete program -->
<media:Audio id="music" src="./assets/music.wav"/>
<mediaop:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" clock={clock}/>
<audio:Track id="music-bed" timeline={speech.timeline}>
  <audio:Clip source={music-media.media} during={speech.window}
    gain="0.28" fade-in="600ms" fade-out="800ms">
    <audio:Map target-at="end" source-at="end" rate="1"
      wrap-from="start" wrap-until="end"/>
  </audio:Clip>
</audio:Track>

<!-- All peer tracks feed into Film -->
<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline} appearance={recipes.film.vertical}>
  <film:Track id="picture" source={picture.visual}/>
  <film:Track source={mix.audio}/>
  <film:Track id="cards" source={cards.visual}/>
  <film:Track id="captions" source={captions.visual}/>
  <film:Track id="meaning" source={meaning.visual}/>
  <film:Track source={music-bed.audio}/>
</film:Film>
```

In this example, Film places the ordinary source picture at 0, Clips at 10, captions at 20 and text
at 30. Higher values paint on top; each relation is visible at the parent Scope that owns it.
