---
title: Element Reference
description: Every element every installed package defines, rendered from the packages themselves.
---

# Element Reference

Every element in this repository, as each package describes itself on its own Markup Surface
declaration. Nothing here is written by hand: this page is rendered from those declarations, and a
test fails when it stops matching them.

Regenerate with `pnpm docs:elements`.

## `@hypit/audio-track@1`

### `<Track>`

One Audio Track: explicitly prepared audio Clips placed on a shared ProgramSpace and lowered to one ordinary peer AudioTrack.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Audio Track and prefixes the identity of every Clip that does not name itself. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Fixes the frame and sample domain every Clip window resolves into. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Clip>` | many | Places one SynchronizedMedia source on an exact program window with its own trim, occupancy and mix. |

`<Clip>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this Clip; the Track derives `<track>.clip.<index>` when it is absent. |
| `source` | reference (@hypit/media@1#SynchronizedMedia) | yes | Selects the explicitly prepared audio this Clip plays. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Spans the whole program when written as `program`, or the window of the referenced Selection. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the window at the cue of the referenced Moment. |
| `for` | literal | no | Fixes the exact length of a Moment window, such as `12f`, `250ms` or `1.5s`. |
| `start` | literal | no | Places the window start at a point expression. |
| `end` | literal | no | Places the window end at a point expression. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds the Selection that resolves `selection.start` and `selection.end` in a start/end window. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds the Moment that resolves `moment.cue` in a start/end window. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Selects the SemanticMap that turns semantic identity into exact time. |
| `occurrences` | literal (one, each) | no | Decides whether a semantic source contributes one window or every occurrence; defaults to `one`. |
| `trim-start` | literal | no | Removes an exact duration from the head of the source. |
| `trim-end` | literal | no | Removes an exact duration from the tail of the source. |
| `playback` | literal (once, once-start, once-end, loop, loop-start, loop-end, stretch) | no | Decides how the source occupies a window longer or shorter than itself; defaults to `once`. |
| `min-rate` | literal | no | Bounds the slowest rate bounded stretch may use. |
| `max-rate` | literal | no | Bounds the fastest rate bounded stretch may use. |
| `gain` | literal | no | Scales this Clip by a linear gain; defaults to `1`. |
| `fade-in` | literal | no | Fixes the exact fade-in length; defaults to `0f`. |
| `fade-out` | literal | no | Fixes the exact fade-out length; defaults to `0f`. |

| Port | Type | Meaning |
|---|---|---|
| `program` | @hypit/audio-track@1#AudioTrackProgram | The resolved sample-exact item list this Track renders from. |
| `track` | @hypit/composition@1#AudioTrack | The rendered AudioTrack that Film composes with its peers. |

```svml
<audio:Track id="music-bed" space={speech.space}>
  <audio:Clip source={music-media.media} during="program"
    playback="loop-end" gain="0.28" fade-in="600ms" fade-out="800ms"/>
</audio:Track>
```

A Track requires at least one Clip, and neither a Track nor a Clip accepts text content.

A Clip states exactly one window form: `during`, `at` with `for`, or `start` with `end`.

A point expression is `program.start`, `program.end`, `selection.start`, `selection.end` or `moment.cue`, each optionally offset by `+` or `-` and a duration, or a bare duration read as an absolute position.

`selection` and `moment` cannot be written together, and `map` is rejected on a start/end window that binds neither.

`min-rate` and `max-rate` are rejected unless `playback` is `stretch`.

## `@hypit/background-removal@1`

### `<Background>`

Removes the background from one image Artifact and publishes the cut-out image.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this removal so its image can be referenced elsewhere in the Source. |
| `source` | reference (@hypit/artifact@1#BlobArtifact) | yes | Chooses the image whose background is removed. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The source image with its background removed. |

```svml
<remove:Background id="cutout" source={portrait.image}/>
```

The element is empty; it accepts no children and no text.

The package chooses no model, threshold or storage — the selected Endpoint fulfills the capability.

## `@hypit/caption-fine@1`

### `<Style>`

Resolves one SVS Recipe and one exact font stack into a complete fine-grained Caption Style.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Style so a Caption Program can assign it. |
| `recipe` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe that carries Cue geometry, Paint and local motion. |
| `font` | reference (@hypit/media@1#FontArtifactRef, @hypit/media@1#FontStackRef) | yes | Chooses the primary face, or a whole reusable stack that already carries its own fallbacks. |

`recipe` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `cue-min-words` | yes | — | Sets the fewest display Words the planner may leave in one Cue. |
| `cue-max-words` | yes | — | Sets the most display Words one Cue may carry, which an indivisible Atom may still exceed. |
| `stack-order` | yes | — | Places this Style's Cues in the Track's drawing order, low behind high. |
| `x` | yes | — | Places the Cue box horizontally as a fraction of the Canvas width. |
| `y` | yes | — | Places the Cue box vertically as a fraction of the Canvas height. |
| `width` | yes | — | Sets the Cue box width as a fraction of the Canvas width. |
| `anchor-x` | no | `left` | Decides which horizontal edge of the Cue box sits on the placement point. One of left, center, right. |
| `anchor-y` | no | `top` | Decides which vertical edge of the Cue box sits on the placement point. One of top, center, bottom. |
| `align` | yes | — | Aligns the Words within each line of the Cue. One of left, center, right. |
| `direction` | no | `ltr` | Sets the writing direction the Words are laid out in. One of ltr, rtl. |
| `line-height` | yes | — | Sets the line box height as a multiple of the type size. |
| `letter-spacing` | no | `0` | Adds pixels of tracking between glyphs. |
| `word-gap` | no | `a quarter of size` | Sets the pixel gap between neighbouring Words. |
| `size` | yes | — | Sets the type size in pixels. |
| `text-transform` | no | `none` | Recases every display Word before it is drawn. One of none, uppercase, lowercase. |
| `fill` | yes | — | Paints the glyph body of an ordinary Word, as an RGB or RGBA hex color. |
| `opacity` | no | `1` | Fades the whole glyph Paint of an ordinary Word. |
| `gradient-from` | no | — | Starts a glyph gradient that replaces the flat fill, and must be written together with gradient-to. |
| `gradient-to` | no | — | Ends the glyph gradient, and must be written together with gradient-from. |
| `gradient-angle` | no | `90` | Turns the glyph gradient by this many degrees. |
| `stroke-color` | no | `#000000` | Paints the outline drawn around each glyph. |
| `stroke-width` | no | `0` | Sets the glyph outline thickness in pixels. |
| `shadow-color` | no | `#000000` | Paints the soft drop shadow behind each glyph. |
| `shadow-opacity` | no | `0` | Sets how strongly the glyph drop shadow reads. |
| `shadow-x` | no | `0` | Offsets the glyph drop shadow horizontally in pixels. |
| `shadow-y` | no | `0` | Offsets the glyph drop shadow vertically in pixels. |
| `shadow-blur` | no | `0` | Softens the glyph drop shadow by this many pixels. |
| `long-shadow-color` | no | `#000000` | Paints the solid extruded shadow trailing each glyph. |
| `long-shadow-opacity` | no | `0` | Sets how strongly the extruded glyph shadow reads. |
| `long-shadow-distance` | no | `0` | Sets how far the extruded glyph shadow travels in pixels. |
| `long-shadow-angle` | no | `45` | Sets the direction the extruded glyph shadow travels in degrees. |
| `glow-color` | no | `#FFFFFF` | Paints the halo bloomed around each glyph. |
| `glow-opacity` | no | `0` | Sets how strongly the glyph halo reads. |
| `glow-blur` | no | `0` | Spreads the glyph halo by this many pixels. |
| `active-fill` | no | `#FFD54A` | Paints the glyph body of the Word being spoken. |
| `active-opacity` | no | `opacity` | Fades the whole glyph Paint of the Word being spoken. |
| `active-gradient-from` | no | — | Starts the active glyph gradient, and must be written together with active-gradient-to. |
| `active-gradient-to` | no | — | Ends the active glyph gradient, and must be written together with active-gradient-from. |
| `active-gradient-angle` | no | `gradient-angle` | Turns the active glyph gradient by this many degrees. |
| `active-stroke-color` | no | `stroke-color` | Paints the outline around the Word being spoken. |
| `active-stroke-width` | no | `stroke-width` | Sets the active glyph outline thickness in pixels. |
| `active-shadow-color` | no | `shadow-color` | Paints the drop shadow behind the Word being spoken. |
| `active-shadow-opacity` | no | `shadow-opacity` | Sets how strongly the active drop shadow reads. |
| `active-shadow-x` | no | `shadow-x` | Offsets the active drop shadow horizontally in pixels. |
| `active-shadow-y` | no | `shadow-y` | Offsets the active drop shadow vertically in pixels. |
| `active-shadow-blur` | no | `shadow-blur` | Softens the active drop shadow by this many pixels. |
| `active-long-shadow-color` | no | `long-shadow-color` | Paints the extruded shadow trailing the Word being spoken. |
| `active-long-shadow-opacity` | no | `long-shadow-opacity` | Sets how strongly the active extruded shadow reads. |
| `active-long-shadow-distance` | no | `long-shadow-distance` | Sets how far the active extruded shadow travels in pixels. |
| `active-long-shadow-angle` | no | `long-shadow-angle` | Sets the direction the active extruded shadow travels in degrees. |
| `active-glow-color` | no | `glow-color` | Paints the halo bloomed around the Word being spoken. |
| `active-glow-opacity` | no | `glow-opacity` | Sets how strongly the active halo reads. |
| `active-glow-blur` | no | `glow-blur` | Spreads the active halo by this many pixels. |
| `background` | yes | — | Paints the Cue box behind the Words, as an RGB or RGBA hex color. |
| `border-color` | no | `#00000000` | Paints the Cue box border. |
| `border-width` | no | `0` | Sets the Cue box border thickness in pixels. |
| `padding` | yes | — | Insets the Words from the Cue box edge, as one pixel number or a vertical and horizontal pair. |
| `radius` | yes | — | Rounds the Cue box corners by this many pixels. |
| `underline` | no | `off` | Decides whether every Word carries a rule beneath it. One of off, always. |
| `underline-color` | no | `fill` | Paints the ordinary Word underline. |
| `underline-thickness` | no | `2` | Sets the ordinary Word underline thickness in pixels. |
| `underline-offset` | no | `4` | Drops the ordinary Word underline this many pixels below the baseline. |
| `active-underline` | no | `off` | Decides whether the Word being spoken, or every Word up to it, carries a rule beneath it. One of off, current, trail. |
| `active-underline-color` | no | `#FFD54A` | Paints the active Word underline. |
| `active-underline-thickness` | no | `3` | Sets the active Word underline thickness in pixels. |
| `active-underline-offset` | no | `4` | Drops the active Word underline this many pixels below the baseline. |
| `karaoke` | no | `off` | Decides whether the active Paint marks only the Word being spoken or every Word up to it. One of off, current, trail. |
| `karaoke-transition` | no | `step` | Decides whether the karaoke Paint snaps at the Word boundary or sweeps across the glyphs. One of step, wipe. |
| `active-box` | no | `off` | Decides whether a highlight box sits behind the Word being spoken or behind every Word up to it. One of off, current, trail. |
| `active-box-continuity` | no | `isolated` | Decides whether trailing highlight boxes stand apart or merge into one run. One of isolated, joined. |
| `active-box-background` | no | `#FFD54A` | Paints the highlight box behind the active Word. |
| `active-box-border-color` | no | `#00000000` | Paints the highlight box border. |
| `active-box-border-width` | no | `0` | Sets the highlight box border thickness in pixels. |
| `active-box-padding` | no | `0` | Insets the Word from the highlight box edge, as one pixel number or a vertical and horizontal pair. |
| `active-box-radius` | no | `8` | Rounds the highlight box corners by this many pixels. |
| `active-box-enter` | no | `none` | Plays this motion as the highlight box arrives on a Word. One of none, fade, pop, scale, spring, bounce, elastic, stamp, tilt, zoom-blur, flip-x, flip-y, spin, squash, stretch, slide-left, slide-right, slide-up, slide-down, blur-in, wipe-left, wipe-right, wipe-up, wipe-down. |
| `active-box-exit` | no | `none` | Plays this motion as the highlight box leaves a Word. One of none, fade, pop, scale, spring, bounce, elastic, stamp, tilt, zoom-blur, flip-x, flip-y, spin, squash, stretch, slide-left, slide-right, slide-up, slide-down, blur-in, wipe-left, wipe-right, wipe-up, wipe-down. |
| `active-box-transition-frames` | no | `0` | Sets how many Frames the highlight box entrance and exit each run for. |
| `cue-enter` | no | `none` | Plays this motion as a Cue arrives. One of none, fade, pop, scale, spring, bounce, elastic, stamp, tilt, zoom-blur, flip-x, flip-y, spin, squash, stretch, slide-left, slide-right, slide-up, slide-down, blur-in, wipe-left, wipe-right, wipe-up, wipe-down. |
| `cue-enter-frames` | no | `0` | Sets how many Frames the Cue entrance runs for. |
| `cue-exit` | no | `none` | Plays this motion as a Cue leaves. One of none, fade, pop, scale, spring, bounce, elastic, stamp, tilt, zoom-blur, flip-x, flip-y, spin, squash, stretch, slide-left, slide-right, slide-up, slide-down, blur-in, wipe-left, wipe-right, wipe-up, wipe-down. |
| `cue-exit-frames` | no | `0` | Sets how many Frames the Cue exit runs for. |
| `atom-enter` | no | `none` | Plays this motion as an Atom arrives within its Cue. One of none, fade, pop, scale, spring, bounce, elastic, stamp, tilt, zoom-blur, flip-x, flip-y, spin, squash, stretch, slide-left, slide-right, slide-up, slide-down, blur-in, wipe-left, wipe-right, wipe-up, wipe-down. |
| `atom-enter-frames` | no | `0` | Sets how many Frames the Atom entrance runs for. |
| `atom-exit` | no | `none` | Plays this motion as an Atom leaves within its Cue. One of none, fade, pop, scale, spring, bounce, elastic, stamp, tilt, zoom-blur, flip-x, flip-y, spin, squash, stretch, slide-left, slide-right, slide-up, slide-down, blur-in, wipe-left, wipe-right, wipe-up, wipe-down. |
| `atom-exit-frames` | no | `0` | Sets how many Frames the Atom exit runs for. |
| `atom-reveal` | no | `all` | Decides whether a Cue shows all of its Atoms at once or uncovers them as they are spoken. One of all, on-start, typewriter. |
| `active-response` | no | `none` | Plays this motion on a Word at the moment it becomes the spoken one. One of none, fade, pop, scale, spring, bounce, elastic, stamp, tilt, zoom-blur, flip-x, flip-y, spin, squash, stretch, slide-left, slide-right, slide-up, slide-down, blur-in, wipe-left, wipe-right, wipe-up, wipe-down. |
| `active-response-frames` | no | `6` | Sets how many Frames the active response runs for. |
| `active-scale` | no | `1.08` | Sets how far the active response grows the Word. |
| `slide-distance` | no | `24` | Sets how far the sliding and wiping motions travel in pixels. |
| `loop` | no | `none` | Plays this motion continuously for as long as its target is on screen. One of none, shake, wobble, glow-pulse, breathe, float, pulse, flicker. |
| `loop-target` | no | `cue` | Decides whether the looping motion moves the whole Cue or only the Atom being spoken. One of cue, active-atom. |
| `loop-period-frames` | no | `12` | Sets how many Frames one cycle of the looping motion takes. |
| `loop-intensity` | no | `1` | Scales how far the looping motion carries. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Fallback>` | many | Appends one more exact face after the primary one, in the order written, and accepts no children of its own. |

`<Fallback>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `font` | reference (@hypit/media@1#FontArtifactRef) | yes | Chooses the single face this fallback contributes. |

```svml
<fonts:Stack id="caption-font" family="inter" weight="800" style="normal"/>
<caption-fine:Style id="primary-caption" recipe={studio.caption.primary} font={caption-font}/>
```

Referencing a font stack in `font` and writing `<Fallback>` children are both allowed; the stack's faces come first.

The Style is addressed by its own id, and the element accepts no text.

The Recipe accepts only the properties declared here; any other property is rejected.

A gradient needs both of its colors: writing any one of `gradient-from`, `gradient-to` or `gradient-angle` without both colors is rejected, and the same holds for the `active-` gradient.

The active glyph Paint inherits every base property it does not override, except the gradient, which the active Paint drops unless it writes its own.

### `<Track>`

Joins a planned Caption against the measured SemanticMap and renders it as one ordinary peer VisualTrack.

**On screen.** One block of caption text wrapped into lines inside a rounded Cue box, placed at a Recipe-chosen point on the Canvas and spanning a fraction of its width. Cues follow the speech one after another, each arriving and leaving with its own motion, and the Words of a Cue either stand there together from its first Frame or uncover as they are spoken. As the speech advances, the Word being spoken, or every Word up to it, is repainted in the active Paint, snapping at the Word boundary or sweeping across the glyphs, and it may take a rule beneath it, a rounded highlight capsule behind it and a brief pop at the moment it becomes the spoken one. That capsule either stands alone on each Atom or grows as one continuous run over everything already read, following the Words across line breaks.

**Preview.** `preview/Track.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Track so its rendered output can be placed in a Film. |
| `display` | reference (@hypit/narrative@1#CaptionDisplaySequence) | yes | Chooses the display Atoms and Words the Cues are drawn from. |
| `correspondence` | reference (@hypit/narrative@1#CaptionCorrespondence) | yes | Chooses the link from display Words back to the spoken Script. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | yes | Chooses the measured Word windows that give every Cue its time. |
| `program` | reference (@hypit/caption@1#CaptionProgram) | yes | Chooses the Style assignment that decides which Style each run is rendered in. |
| `plan` | reference (@hypit/caption@1#CaptionPlan) | yes | Chooses the Cue cuts the planner produced for this display. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Chooses the ProgramSpace the rendered Track is laid out against. |

| Port | Type | Meaning |
|---|---|---|
| `track` | @hypit/composition@1#VisualTrack | The rendered Caption as one self-contained VisualTrack. |

```svml
<caption-fine:Track
  id="captions"
  display={story.caption}
  correspondence={story.caption.correspondence}
  map={timing.map}
  space={speech.space}
  program={caption-program}
  plan={caption-plan.plan}
/>
```

The element is empty; it accepts no children and no text.

One Track renders the Program's default Style and every ordered replacement together.

## `@hypit/caption-gemini@1`

### `<Planner>`

Asks a Gemini model to cut a Caption display sequence into Cues and assign declared fields, producing a CaptionPlan.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this planner and prefixes the bindings it publishes. |
| `display` | reference (@hypit/narrative@1#CaptionDisplaySequence) | yes | The display sequence whose Atoms Gemini reads and must cover completely. |
| `program` | reference (@hypit/caption@1#CaptionProgram) | yes | The Caption Program whose resolved Style runs bound each planning request. |
| `model` | literal (gemini-2.5-flash, gemini-3.1-pro-preview) | yes | Which Gemini model the Runtime capability answers with. |

| Port | Type | Meaning |
|---|---|---|
| `plan` | @hypit/caption@1#CaptionPlan | The validated CaptionPlan, with stable Atom and Word ids restored. |

```svml
<caption-ai:Planner
  id="caption-plan"
  display={story.caption}
  program={caption-program}
  model="gemini-2.5-flash"
/>
```

The element accepts no children.

Model choice is author-visible; the Runtime separately binds the planning capability to an Endpoint.

## `@hypit/caption@1`

### `<Program>`

Assigns one Caption Style to every display Word of a CaptionDisplaySequence and publishes the resulting CaptionProgram.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the CaptionProgram Record this element publishes. |
| `display` | reference (@hypit/narrative@1#CaptionDisplaySequence) | yes | Selects the display Word sequence this Program covers. |
| `default` | reference (@hypit/caption@1#CaptionStyle) | yes | Selects the Style every display Word carries before any Use rule applies. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Use>` | many | Replaces the whole Style on one Role or one explicit Word subset, with the last matching rule winning. |
| `<Mute>` | many | Hides the whole Atoms of one Role or one explicit Word subset after Cue planning. |

`<Use>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `style` | reference (@hypit/caption@1#CaptionStyle) | yes | Selects the Style the covered display Words carry instead of the default. |
| `role` | literal | no | Names the Script Role whose display Words the rule covers, as sugar for that Role's Word subset rather than a time range. |
| `words` | reference (@hypit/narrative@1#CaptionDisplayWordSubset) | no | Selects the explicit display Words the rule covers. |

`<Mute>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `role` | literal | no | Names the Script Role whose display Words the rule hides, as sugar for that Role's Word subset rather than a time range. |
| `words` | reference (@hypit/narrative@1#CaptionDisplayWordSubset) | no | Selects the explicit display Words the rule hides. |

```svml
<caption:Program id="captions" display={story.caption} default={plain}>
  <caption:Use role="ALICE" style={impact}/>
  <caption:Use words={story.caption.selection.special} style={plain}/>
  <caption:Mute words={story.caption.selection.private}/>
</caption:Program>
```

`Use` and `Mute` each take exactly one of `role` or `words`.

The CaptionProgram is published under the bare `id`, and the element carries no text content.

## `@hypit/comment-sticker@1`

### `<Style>`

Reads one SVS Recipe and one exact Font Stack into a comment card Style that Stickers share.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Style so a Sticker can reference it. |
| `recipe` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe that decides the card's appearance and its enter, hold and exit motion. |
| `font` | reference (@hypit/media@1#FontStackRef) | yes | Chooses the Font Stack the card's header, body and metadata rows are set in. |

`recipe` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `stack-order` | no | `62` | Sets the stacking order every card drawn in this Style takes among the Program's visual Tracks. |
| `background` | no | `#ffffff` | Fills the card body, and the tail that hangs beneath it. |
| `border-color` | no | `#0000000e` | Colors the hairline drawn around the card body. |
| `border-width` | no | `1` | Sets the thickness of that hairline in pixels. |
| `radius` | no | `28` | Rounds the card's corners in pixels. |
| `padding-x` | no | `28` | Insets the avatar and the text column from the card's left and right edges in pixels. |
| `padding-y` | no | `24` | Insets the header row from the card's top edge and the metadata row from its bottom edge in pixels. |
| `gap` | no | `18` | Sets the space in pixels between the avatar and the text column, and scales the smaller gaps that separate the header, body and metadata rows. |
| `rotation` | no | `-2.5` | Tilts the whole card in degrees about its center, before any motion is added. |
| `shadow-color` | no | `#0000004d` | Colors the shadow cast by the card body. |
| `shadow-x` | no | `0` | Offsets that shadow horizontally in pixels. |
| `shadow-y` | no | `18` | Offsets that shadow vertically in pixels. |
| `shadow-blur` | no | `46` | Sets the shadow's blur radius in pixels. |
| `shadow-spread` | no | `0` | Grows or shrinks the shadow beyond the card's outline in pixels. |
| `tail` | no | `true` | Decides whether the card carries a speech tail below its bottom edge. |
| `tail-width` | no | `42` | Sets the width of that tail in pixels. |
| `tail-height` | no | `28` | Sets the height of that tail in pixels, which is taken out of the Frame's height before the card body is laid out. |
| `tail-offset-x` | no | `58` | Places the tail's left edge that many pixels in from the card's left edge. |
| `avatar-fallback` | no | `none` | Decides what stands in for a missing avatar Artifact: nothing, or a disc bearing the author's first letter. One of none, initial. |
| `avatar-size` | no | `58` | Sets the avatar's diameter in pixels, which also narrows the text column beside it. |
| `avatar-border-width` | no | `3` | Sets the thickness of the ring around the avatar in pixels. |
| `avatar-border-color` | no | `#ffffff` | Colors that ring. |
| `avatar-background` | no | `#34313a` | Fills the initial disc drawn when no avatar Artifact is supplied. |
| `avatar-text-color` | no | `#ffffff` | Colors the letter on that disc. |
| `header-size` | no | `24` | Sets the header row's type size in pixels. |
| `header-weight` | no | `680` | Sets the header row's font weight. |
| `header-line-height` | no | `1.15` | Sets the header row's line height as a multiple of its size, which also fixes the row's height. |
| `header-color` | no | `#8f8f8f` | Colors the header row. |
| `body-size` | no | `42` | Sets the comment copy's type size in pixels. |
| `body-weight` | no | `850` | Sets the comment copy's font weight. |
| `body-line-height` | no | `1.16` | Sets the comment copy's line height as a multiple of its size. |
| `body-color` | no | `#111111` | Colors the comment copy. |
| `body-max-lines` | no | `3` | Sets how many lines the comment copy wraps to before it is ellipsized. |
| `meta-size` | no | `21` | Sets the metadata row's type size in pixels. |
| `meta-weight` | no | `650` | Sets the metadata row's font weight. |
| `meta-line-height` | no | `1.15` | Sets the metadata row's line height as a multiple of its size, which also fixes the row's height. |
| `meta-color` | no | `#8f8f8f` | Colors the metadata row. |
| `enter` | no | `pop` | Selects how the card arrives at the start of its window. One of none, fade, pop, slide-pop. |
| `enter-frames` | no | `17` | Sets how many Frames the arrival takes. |
| `enter-offset-y` | no | `-180` | Sets the vertical distance in pixels a `slide-pop` arrival travels from. |
| `enter-start-scale` | no | `0.78` | Sets the scale a `pop` or `slide-pop` arrival grows from. |
| `enter-rotation-delta` | no | `-4.5` | Sets the extra tilt in degrees a `pop` or `slide-pop` arrival unwinds from. |
| `enter-easing` | no | `ease-out` | Shapes the arrival's progress over its Frames. One of linear, ease-in, ease-out, ease-in-out. |
| `exit` | no | `fade-up` | Selects how the card leaves at the end of its window. One of none, fade, fade-up. |
| `exit-frames` | no | `20` | Sets how many Frames the departure takes. |
| `exit-offset-y` | no | `-28` | Sets the vertical distance in pixels a `fade-up` departure drifts. |
| `exit-easing` | no | `ease-in` | Shapes the departure's progress over its Frames. One of linear, ease-in, ease-out, ease-in-out. |
| `hold` | no | `float` | Selects how the card behaves between its arrival and its departure. One of none, float. |
| `hold-amplitude-y` | no | `4` | Sets how far in pixels a `float` hold rises and falls. |
| `hold-rotation-amplitude` | no | `0.35` | Sets how far in degrees a `float` hold rocks either side of the card's tilt. |
| `hold-period-frames` | no | `84` | Sets how many Frames one `float` cycle takes. |

```svml
<comment:Style id="social-comment" recipe={styles.comment} font={fonts.ui}/>
```

The element is empty; it accepts no children and no text.

The Style is published as a Record under its own id.

Every Recipe key has a default, so a Recipe states only what it changes.

The Recipe refuses any property outside the set declared here.

The Recipe owns appearance and local motion only; placement and size stay with the Sticker's Frame.

### `<Track>`

Places social comment cards over the Program and renders them as one self-contained VisualTrack.

**On screen.** One rounded card per Sticker, tilted a couple of degrees and lifted on a soft drop shadow, drawn at the place and size its Frame gives it on the Canvas, with a small triangular speech tail hanging from the card's lower edge. Inside the card a circular avatar sits at the left — the supplied image Artifact, or a filled disc bearing the author's initial — and a text column runs beside it from top to bottom: a small faint header line such as `Reply to @viewer's comment`, then the comment copy in large heavy type wrapped to a few lines and ellipsized, then a small faint metadata row pinned to the card's bottom edge when one is supplied. Each card keeps its own window rather than a shared one: it pops in scaling up and unwinding its tilt, rises and rocks gently while it holds, then fades upward as it leaves. Cards are placed by their Frames alone, so several stand on screen at once and none reflows around another.

**Preview.** `preview/Track.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Track and prefixes every binding it publishes. |
| `canvas` | reference (@hypit/spatial@1#CanvasSpace) | yes | Chooses the Canvas the cards are laid out on. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Chooses the ProgramSpace whose duration and frame rate every card window is measured against. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Supplies the SemanticMap that resolves the Selections and Moments its Stickers bind to. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Sticker>` | many | One comment card with its own copy, Frame, Style and temporal window. |

`<Sticker>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this card among the Track's items. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame that places and sizes the card on the Canvas. |
| `style` | reference (@hypit/comment-sticker@1#CommentStickerStyle) | yes | Chooses the Comment Sticker Style the card is drawn and animated in. |
| `comment` | expression (@hypit/text@1#Text) | no | Supplies the card's comment copy in place of the element's own text. |
| `author` | expression (@hypit/text@1#Text) | no | Supplies the name the comment is attributed to. |
| `header` | expression (@hypit/text@1#Text) | no | Supplies the card's header row. |
| `meta` | expression (@hypit/text@1#Text) | no | Supplies the card's metadata row, which is not rendered when it is absent. |
| `avatar` | reference (@hypit/artifact@1#BlobArtifact) | no | Supplies the image Artifact drawn as the commenter's avatar. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Spans the whole Program when written as `program`, or the referenced Selection. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Opens the card's window at the referenced Moment's cue. |
| `for` | literal | no | Sets the length of a Moment window as an exact duration such as `48f`, `240ms` or `2.5s`. |
| `start` | literal | no | Opens the window at `program.start`, `program.end`, `selection.start`, `selection.end` or `moment.cue` with an optional `+` or `-` duration offset, or at a bare duration measured from the start of the Program. |
| `end` | literal | no | Closes the window at `program.start`, `program.end`, `selection.start`, `selection.end` or `moment.cue` with an optional `+` or `-` duration offset, or at a bare duration measured from the start of the Program. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Resolves `selection.start` and `selection.end` in an explicit start and end window. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Resolves `moment.cue` in an explicit start and end window. |
| `occurrences` | literal (one, each) | no | Decides whether a bound Selection or Moment places one card or one card per occurrence, defaulting to `one`. |

The card's comment copy, read when `comment` is absent.

| Port | Type | Meaning |
|---|---|---|
| `program` | @hypit/comment-sticker@1#CommentStickerProgram | Every placed card, finalized as one Comment Sticker Program. |
| `track` | @hypit/composition@1#VisualTrack | That Program rendered as one VisualTrack. |

```svml
<comment:Track id="comments" canvas={vertical} space={speech.space} map={timing.map}>
  <comment:Sticker id="one" frame={comment-frame} style={social} avatar={viewer-avatar}
    author="@viewer" meta="Featured" during={story.selection.reaction}>
    Wait, it pinned the caption to the word, not the second.
  </comment:Sticker>
</comment:Track>
```

A Track requires at least one Sticker.

`map` is refused when no Sticker binds to a Selection or a Moment, rather than ignored.

A Sticker states exactly one temporal form: `during`, `at` with `for`, or `start` with `end`.

With `start` and `end`, `selection` or `moment` binds the point of reference; both together are refused.

A Sticker's copy is either `comment` or the element's own text; stating both is refused, and one of the two is required.

Stacking order comes from the Style's Recipe, so a Sticker has no `z`.

## `@hypit/deck-track@1`

### `<DepthStack>`

Deals ordered Cards into one Frame, each at its own Moment, and publishes the deck and the VisualTrack it renders to.

**On screen.** One leaning pile of overlapping picture Cards inside a single Frame, every Card drawn over the same rectangle and told apart only by its pose. The Card most recently dealt sits in front, upright and at full size; each Card dealt before it stands one step further behind — shifted down, smaller, tilted, fainter and duller with every step — and each Card still to come peeks out the opposite way, with two behind and one ahead kept on screen by default, so at most four Cards share the Frame. A Card is its own still, timed or surface picture fitted into that Frame, optionally over a painted Frame, inside a rounded clip and behind a border and shadows, and may carry a line of label copy laid across it. Cards arrive one at a time in document order: at each Card's Moment the arriving Card fades in from beyond the visible neighborhood and the whole pile slides, scales and rotates into its new poses over a handful of Frames, the Card pushed off the back fading out, and the pile as a whole may arrive, drift and leave as one.

**Preview.** `preview/DepthStack.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this deck so its Program and Track can be referenced elsewhere in the Source. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | yes | Chooses the SemanticMap that places each Card's Moment in the programme. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Chooses the ProgramSpace the deck is timed against. |
| `canvas` | reference (@hypit/spatial@1#CanvasSpace) | yes | Chooses the Canvas the deck is rendered into. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame the whole stack occupies. |
| `appearance` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe for visibility, depth poses, frame Paint, motion and reflow, and the Recipe every Card falls back to. |
| `until` | expression (program.end, @hypit/narrative@1#NarrativeMoment, @hypit/narrative@1#NarrativeSelection) | yes | Ends the deck at the literal `program.end`, at a Moment, or at a Selection. |
| `until-boundary` | literal (start, end) | no | Chooses which edge of the ending Selection ends the deck. |

`appearance` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `visible-previous` | no | `2` | Sets how many Cards dealt before the current one stay on screen behind it. |
| `visible-next` | no | `1` | Sets how many Cards still to be dealt stay on screen behind the current one. |
| `wrap` | no | `false` | Decides whether depth wraps around the ends of the deck so the first and last Cards are neighbours. |
| `current-x` | no | `0` | Offsets the current Card horizontally within the Frame in pixels. |
| `current-y` | no | `0` | Offsets the current Card vertically within the Frame in pixels. |
| `current-scale` | no | `1` | Scales the current Card about its own center. |
| `current-rotation` | no | `0` | Tilts the current Card in degrees about its own center. |
| `current-opacity` | no | `1` | Sets the opacity the current Card is drawn at. |
| `current-stacking` | no | `0` | Places the current Card in the deck's own stacking order, above the Cards behind it. |
| `current-brightness` | no | `1` | Sets the brightness the current Card is toned to. |
| `current-contrast` | no | `1` | Sets the contrast the current Card is toned to. |
| `current-saturation` | no | `1` | Sets the saturation the current Card is toned to. |
| `previous-x-step` | no | `0` | Shifts each already dealt Card horizontally by this many pixels for every step it stands behind the current one. |
| `previous-y-step` | no | `28` | Shifts each already dealt Card vertically by this many pixels for every step it stands behind the current one. |
| `previous-scale-step` | no | `0.94` | Scales each already dealt Card by this factor for every step it stands behind the current one. |
| `previous-rotation-step` | no | `-2.5` | Tilts each already dealt Card by this many degrees for every step it stands behind the current one. |
| `previous-rotation-mode` | no | `alternate` | Decides whether that tilt accumulates in one direction or alternates side to side with each step of depth. One of linear, alternate. |
| `previous-opacity-step` | no | `0.82` | Multiplies the opacity of each already dealt Card for every step it stands behind the current one. |
| `previous-stacking-step` | no | `-1` | Moves each already dealt Card this far down the deck's stacking order for every step it stands behind the current one. |
| `next-x-step` | no | `0` | Shifts each undealt Card horizontally by this many pixels for every step it stands ahead of the current one. |
| `next-y-step` | no | `-20` | Shifts each undealt Card vertically by this many pixels for every step it stands ahead of the current one. |
| `next-scale-step` | no | `0.92` | Scales each undealt Card by this factor for every step it stands ahead of the current one. |
| `next-rotation-step` | no | `2` | Tilts each undealt Card by this many degrees for every step it stands ahead of the current one. |
| `next-rotation-mode` | no | `alternate` | Decides whether that tilt accumulates in one direction or alternates side to side with each step of depth. One of linear, alternate. |
| `next-opacity-step` | no | `0.72` | Multiplies the opacity of each undealt Card for every step it stands ahead of the current one. |
| `next-stacking-step` | no | `-1` | Moves each undealt Card this far down the deck's stacking order for every step it stands ahead of the current one. |
| `reflow-frames` | no | `8` | Sets how many Frames the stack takes to settle into its new poses after a Card is dealt. |
| `reflow-easing` | no | `ease-in-out` | Shapes that settling over its Frames. One of linear, ease-in, ease-out, ease-in-out. |
| `stack-order` | no | `30` | Sets the base stacking order the deck takes among the Film's visual Tracks, which each Card's own depth stacking is added to. |
| `clip` | no | `frame` | Decides whether a Card is clipped to its Frame, to a rounded Frame, or not at all. One of none, frame, rounded. |
| `radius` | no | `0` | Rounds the corners a `rounded` clip cuts to, in pixels. |
| `padding` | no | `0` | Insets the picture from the Card's Frame in pixels, written as one, two or four edge values. |
| `border-width` | no | `0` | Sets the thickness of the border drawn around a Card in pixels, and at `0` no border is drawn at all. |
| `border-style` | no | `solid` | Selects the stroke that border is drawn with. One of solid, dashed, dotted. |
| `border-color` | no | — | Colors that border, and is required whenever `border-width` is not `0`. |
| `shadows` | no | `none` | Casts shadows behind a Card, as `x y blur spread color` entries separated by semicolons. |
| `enter` | no | `none` | Selects how the deck arrives at the start of its span. One of none, fade, slide, scale, pop, bounce, blur-reveal, wipe, flip, spin. |
| `enter-frames` | no | — | Sets how many Frames that arrival takes, and is required whenever `enter` is anything but `none`. |
| `enter-easing` | no | `ease-in-out` | Shapes the arrival's progress over its Frames. One of linear, ease-in, ease-out, ease-in-out. |
| `enter-direction` | no | — | Sends the arrival in one direction, for the operators that travel. One of left, right, up, down. |
| `enter-amount` | no | — | Sets how far the arrival travels or scales, in the units its operator reads. |
| `enter-origin` | no | — | Starts the arrival from beyond the Canvas rather than from the deck's own Frame. One of outside-canvas. |
| `sustain` | no | `none` | Keeps the deck moving between its arrival and its departure, as `operator amount cycles [direction]` entries separated by commas, over `float`, `breathe`, `pulse`, `wobble`, `shake` and `drift`. |
| `exit` | no | `none` | Selects how the deck leaves at the end of its span. One of none, fade, slide, scale, pop, bounce, blur-reveal, wipe, flip, spin. |
| `exit-frames` | no | — | Sets how many Frames that departure takes, and is required whenever `exit` is anything but `none`. |
| `exit-easing` | no | `ease-in-out` | Shapes the departure's progress over its Frames. One of linear, ease-in, ease-out, ease-in-out. |
| `exit-direction` | no | — | Sends the departure in one direction, for the operators that travel. One of left, right, up, down. |
| `exit-amount` | no | — | Sets how far the departure travels or scales, in the units its operator reads. |
| `exit-origin` | no | — | Carries the departure out beyond the Canvas rather than stopping at the deck's own Frame. One of outside-canvas. |
| `fit` | no | `contain` | Decides how a Card's picture is sized against the Card's Frame. One of contain, cover, fit-width, fit-height, native, scale-down, stretch. |
| `frame-x` | no | `0.5` | Picks the horizontal point of the Card's Frame the picture is anchored to, as a fraction of its width. |
| `frame-y` | no | `0.5` | Picks the vertical point of the Card's Frame the picture is anchored to, as a fraction of its height. |
| `content-x` | no | `0.5` | Picks the horizontal point of the picture that meets that Frame point, as a fraction of its width. |
| `content-y` | no | `0.5` | Picks the vertical point of the picture that meets that Frame point, as a fraction of its height. |
| `fit-offset-x` | no | `0` | Nudges the fitted picture horizontally in pixels after it is anchored. |
| `fit-offset-y` | no | `0` | Nudges the fitted picture vertically in pixels after it is anchored. |
| `fit-constraint` | no | `bounded` | Decides whether the fitted picture is held inside the Card's Frame or allowed to run past it. One of bounded, free. |
| `frame-paint` | no | `transparent` | Fills the Card's Frame behind its picture, as a color, `linear(angle;stops)` or `radial(x,y;stops)`. |
| `opacity` | no | `1` | Sets the opacity the Card's picture is sampled at, before any depth pose is applied. |
| `blur` | no | `0` | Blurs the Card's picture by this radius in pixels. |
| `brightness` | no | `1` | Sets the brightness the Card's picture is sampled at, before any depth tone is applied. |
| `contrast` | no | `1` | Sets the contrast the Card's picture is sampled at, before any depth tone is applied. |
| `saturation` | no | `1` | Sets the saturation the Card's picture is sampled at, before any depth tone is applied. |
| `playback` | no | `once-start` | Decides how timed material occupies the Card's window, and is refused on a still image. One of once-start, once-end, hold-start, hold-end, loop-start, loop-end, stretch. |
| `trim-start` | no | — | Starts timed material at this frame of its own timeline, and must be written together with `trim-end`. |
| `trim-end` | no | — | Ends timed material before this frame of its own timeline, and must be written together with `trim-start`. |
| `playback-future` | no | `hold-head` | Decides what a Card shows before it is dealt: its first frame held, or its own timeline running on. One of hold-head, continue. |
| `playback-past` | no | `hold-tail` | Decides what a Card shows once its material is spent: its last frame held, its own timeline running on, or nothing. One of hold-tail, continue, hide. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Card>` | many | One card of the stack, dealt at its own Moment in document order. |

`<Card>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Card within the deck. |
| `source` | reference (@hypit/artifact@1#BlobArtifact, @hypit/media@1#SynchronizedMedia, @hypit/media@1#CompositableSurfaceRef) | yes | Chooses the picture the Card shows, as a still image Artifact, a Synchronized Medium or a Compositable Surface. |
| `extent` | reference (@hypit/spatial@1#IntrinsicExtent) | no | Gives a still image its pixel Extent, which timed and surface sources already carry. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment the Card is dealt on. |
| `appearance` | reference (@hypit/svs@1#Recipe) | no | Chooses this Card's own Recipe in place of the deck's, adding explicit future and past playback. |
| `label` | reference (@hypit/deck-track@1#DepthStackCardLabel) | no | Chooses the bound label this Card carries; without it the Card is unlabelled. |

| Port | Type | Meaning |
|---|---|---|
| `program` | @hypit/deck-track@1#DepthStackProgram | The resolved deck: its span, its Frame, its spec and its ordered Cards. |
| `track` | @hypit/composition@1#VisualTrack | The rendered deck, an ordinary peer VisualTrack. |

```svml
<deck:DepthStack
  id="proof-stack"
  map={timing.map}
  space={speech.space}
  canvas={vertical}
  frame={layout.proof-stack}
  until={story.selection.proof}
  appearance={studio.deck.proof}
>
  <deck:Card id="proof-1" source={proof1.image} extent={proof1.extent}
    at={story.moment.proof1} label={proof-label-style}/>
  <deck:Card id="proof-2" source={proof2.video} at={story.moment.proof2}/>
</deck:DepthStack>
```

The deck requires at least one Card, and a Card is empty.

`extent` is required for a still image source and refused for a Synchronized Medium or a Compositable Surface.

`until-boundary` defaults to `end` and is refused unless `until` names a Selection.

Both Recipes are closed: any property outside the ones listed here is refused, and a Card without its own `appearance` reads the deck's Recipe for fit, sampling, frame Paint and playback.

### `<Label>`

Binds label copy to one exact font stack and one label appearance, and publishes the label a Card carries.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this label so a Card can reference it. |
| `content` | reference (@hypit/text@1#Text) | no | Chooses an existing Text as the label copy in place of the element's own text. |
| `font` | reference (@hypit/media@1#FontStackRef) | yes | Chooses the exact font stack the label is set in. |
| `size` | literal | no | Sets the type size of the label copy in pixels. |
| `color` | literal | no | Sets the color the label copy is painted in. |
| `align` | literal (start, center, end, justify) | no | Places the copy across the inline axis of the label box. |
| `block` | literal (start, center, end) | no | Places the copy along the block axis of the label box. |
| `padding` | literal | no | Sets the padding in pixels on every edge of the label box. |

The element's own text is the label copy whenever `content` is absent; writing both is refused.

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/deck-track@1#DepthStackCardLabel | The bound label, addressed by the element's own id. |

```svml
<deck:Label id="proof-label-style" content={proof-label}
  font={fonts.ui} size="34" color="#ffffff"/>
```

`size` defaults to 34, `color` to `#ffffff`, `align` to `center`, `block` to `end` and `padding` to 20.

The element accepts no child elements; filenames, URLs and media metadata are never read as label copy.

## `@hypit/estimate@1`

### `<Speech>`

Estimates the SpeechDuration of a Text from language-aware pronunciation units and an explicit delivery policy, without calling a Provider.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the estimate that the published duration and policy bindings are addressed under. |
| `source` | reference (@hypit/text@1#Text) | yes | Selects the Text whose pronunciation units are counted. |
| `policy` | reference (@hypit/svs@1#Recipe) | no | Selects an SVS Recipe carrying the whole policy, in place of the inline parameters. |
| `language` | literal (auto, en, zh, ja, es) | no | Selects the counting rules the Text is read with, or detects them from the Text. |
| `pace` | literal (slow, normal, fast) | no | Selects a named delivery density for the chosen language. |
| `rate` | literal | no | Sets the delivery density in pronunciation units per second, in place of pace. |
| `min` | literal | no | Sets the shortest duration in seconds the estimate may report. |
| `max` | literal | no | Sets the longest duration in seconds the estimate may report. |
| `rounding` | literal (none, round, ceil) | no | Selects how the bounded duration is rounded to a whole second. |

`policy` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `language` | yes | — | Selects the counting rules the Text is read with, or detects them from the Text. One of auto, en, zh, ja, es. |
| `pace` | no | — | Selects a named delivery density for the chosen language. One of slow, normal, fast. |
| `rate` | no | — | Sets the delivery density in pronunciation units per second, in place of pace. |
| `min` | yes | — | Sets the shortest duration in seconds the estimate may report. |
| `max` | yes | — | Sets the longest duration in seconds the estimate may report. |
| `rounding` | yes | — | Selects how the bounded duration is rounded to a whole second. One of none, round, ceil. |

| Port | Type | Meaning |
|---|---|---|
| `duration` | @hypit/speech@1#SpeechDuration | The estimated duration in seconds of speaking the source Text. |

```svml
<estimate:Speech
  id="opening-duration"
  source={story.segment.opening.speech}
  language="en"
  pace="normal"
  min="4"
  max="15"
  rounding="round"
/>
```

Either policy or the inline parameters, never both. The inline form requires language, min, max, rounding and exactly one of pace or rate; the Recipe behind policy carries those same properties.

The Recipe behind policy rejects any property outside language, pace, rate, min, max and rounding, and requires exactly one of pace or rate. Nothing is optional beyond that choice: the Recipe supplies every value itself.

The resolved policy is sealed into a SpeechEstimatePolicy Record published as `<id>.policy`.

The element must be empty.

## `@hypit/film@1`

### `<Film>`

Assembles any number of peer VisualTrack and AudioTrack references into one Composition against a Canvas and a ProgramSpace.

**On screen.** One flat fill of the entire Canvas, in the single hexadecimal color the Recipe's `background` carries, lying behind everything else in the Frame. It covers the full Canvas width and height, holds that one color from the first Frame to the last, and never moves, fades or changes. Wherever nothing is painted over it, that color is what the Frame shows; the Film puts no mark of its own on top of it.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Film component and the Composition binding it publishes. |
| `canvas` | reference (@hypit/spatial@1#CanvasSpace) | yes | Selects the CanvasSpace that decides the Composition's dimensions. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Selects the ProgramSpace that decides the Composition's duration and frame rate. |
| `appearance` | reference (@hypit/svs@1#Recipe) | yes | Selects the SVS Recipe that decides the clear color behind every Track. |

`appearance` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `background` | yes | — | Decides the color the Film clears to behind every Track, written as `#rrggbb` or `#rrggbbaa`. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Track>` | many | Adds one VisualTrack or AudioTrack to the assembly. |

`<Track>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `source` | reference (@hypit/composition@1#VisualTrack, @hypit/composition@1#AudioTrack) | yes | Selects the Track this entry contributes to the Composition. |

| Port | Type | Meaning |
|---|---|---|
| `composition` | @hypit/composition@1#Composition | The assembled Composition, addressed as `<id>.composition`. |

```svml
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audioTrack}/>
  <film:Track source={captions.track}/>
</film:Film>
```

At least one `Track` is required.

The Recipe carries exactly one property, `background`, written as a hexadecimal color; any other property is rejected, and Canvas geometry and frame rate stay on their own edges.

Child order is organizational: Track identity, timing and absolute stacking stay in their own typed values.

## `@hypit/fonts-open@1`

### `<Face>`

Materializes one exact catalog face as a content-addressed FontArtifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the FontArtifact Record this element publishes. |
| `family` | literal (abril-fatface, alfa-slab-one, anton, architects-daughter, archivo, archivo-black, bangers, barlow, barlow-condensed, bebas-neue, black-ops-one, bodoni-moda, bungee, cabin, caveat, cinzel, coming-soon, cormorant-garamond, crimson-pro, dm-sans, dm-serif-display, eb-garamond, figtree, fira-code, fira-sans-condensed, fraunces, fredoka, geist, geist-mono, gloock, handlee, ibm-plex-mono, instrument-sans, instrument-serif, inter, jetbrains-mono, josefin-sans, jost, kalam, kanit, lato, league-spartan, lexend, libre-baskerville, lilita-one, liu-jian-mao-cao, long-cang, lora, luckiest-guy, ma-shan-zheng, manrope, merriweather, montserrat, mulish, newsreader, noto-color-emoji, noto-emoji, noto-naskh-arabic, noto-sans, noto-sans-arabic, noto-sans-devanagari, noto-sans-hebrew, noto-sans-hk, noto-sans-jp, noto-sans-kr, noto-sans-sc, noto-sans-tc, noto-sans-thai, noto-serif-jp, noto-serif-kr, noto-serif-sc, noto-serif-tc, nunito-sans, onest, open-sans, oswald, outfit, pacifico, patrick-hand, permanent-marker, pinyon-script, playfair-display, playpen-sans, plus-jakarta-sans, poppins, quicksand, raleway, rethink-sans, righteous, roboto, roboto-condensed, roboto-mono, roboto-slab, rubik, satisfy, shadows-into-light, shantell-sans, short-stack, sora, source-serif-4, space-grotesk, space-mono, unbounded, urbanist, vollkorn, work-sans, zcool-kuaile, zcool-qingke-huangyou, zcool-xiaowei) | yes | Chooses the catalog family the face is taken from. |
| `weight` | literal | yes | Chooses the exact weight, which the family must publish. |
| `style` | literal (normal, italic) | yes | Chooses the exact style, which the family must publish. |

```svml
<fonts:Face id="headline" family="archivo-black" weight="400" style="normal"/>
```

The element is empty; it accepts no children and no text.

A static family accepts only a weight it ships; a variable family accepts any whole weight inside its range.

The FontArtifact is published under the bare `id`, and an unavailable family, weight or style fails before any bytes are read.

### `<Stack>`

Orders one primary catalog face, its written fallbacks and an optional Emoji face into one reusable FontStack.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the FontStack Record this element publishes. |
| `family` | literal (abril-fatface, alfa-slab-one, anton, architects-daughter, archivo, archivo-black, bangers, barlow, barlow-condensed, bebas-neue, black-ops-one, bodoni-moda, bungee, cabin, caveat, cinzel, coming-soon, cormorant-garamond, crimson-pro, dm-sans, dm-serif-display, eb-garamond, figtree, fira-code, fira-sans-condensed, fraunces, fredoka, geist, geist-mono, gloock, handlee, ibm-plex-mono, instrument-sans, instrument-serif, inter, jetbrains-mono, josefin-sans, jost, kalam, kanit, lato, league-spartan, lexend, libre-baskerville, lilita-one, liu-jian-mao-cao, long-cang, lora, luckiest-guy, ma-shan-zheng, manrope, merriweather, montserrat, mulish, newsreader, noto-color-emoji, noto-emoji, noto-naskh-arabic, noto-sans, noto-sans-arabic, noto-sans-devanagari, noto-sans-hebrew, noto-sans-hk, noto-sans-jp, noto-sans-kr, noto-sans-sc, noto-sans-tc, noto-sans-thai, noto-serif-jp, noto-serif-kr, noto-serif-sc, noto-serif-tc, nunito-sans, onest, open-sans, oswald, outfit, pacifico, patrick-hand, permanent-marker, pinyon-script, playfair-display, playpen-sans, plus-jakarta-sans, poppins, quicksand, raleway, rethink-sans, righteous, roboto, roboto-condensed, roboto-mono, roboto-slab, rubik, satisfy, shadows-into-light, shantell-sans, short-stack, sora, source-serif-4, space-grotesk, space-mono, unbounded, urbanist, vollkorn, work-sans, zcool-kuaile, zcool-qingke-huangyou, zcool-xiaowei) | yes | Chooses the catalog family the primary face is taken from. |
| `weight` | literal | yes | Chooses the primary face's exact weight, which the family must publish. |
| `style` | literal (normal, italic) | yes | Chooses the primary face's exact style, which the family must publish. |
| `emoji` | literal (color, mono) | no | Appends a pinned Emoji face after every other face in the stack. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Fallback>` | many | Appends one more exact catalog face after the primary one, in the order written. |

`<Fallback>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `family` | literal (abril-fatface, alfa-slab-one, anton, architects-daughter, archivo, archivo-black, bangers, barlow, barlow-condensed, bebas-neue, black-ops-one, bodoni-moda, bungee, cabin, caveat, cinzel, coming-soon, cormorant-garamond, crimson-pro, dm-sans, dm-serif-display, eb-garamond, figtree, fira-code, fira-sans-condensed, fraunces, fredoka, geist, geist-mono, gloock, handlee, ibm-plex-mono, instrument-sans, instrument-serif, inter, jetbrains-mono, josefin-sans, jost, kalam, kanit, lato, league-spartan, lexend, libre-baskerville, lilita-one, liu-jian-mao-cao, long-cang, lora, luckiest-guy, ma-shan-zheng, manrope, merriweather, montserrat, mulish, newsreader, noto-color-emoji, noto-emoji, noto-naskh-arabic, noto-sans, noto-sans-arabic, noto-sans-devanagari, noto-sans-hebrew, noto-sans-hk, noto-sans-jp, noto-sans-kr, noto-sans-sc, noto-sans-tc, noto-sans-thai, noto-serif-jp, noto-serif-kr, noto-serif-sc, noto-serif-tc, nunito-sans, onest, open-sans, oswald, outfit, pacifico, patrick-hand, permanent-marker, pinyon-script, playfair-display, playpen-sans, plus-jakarta-sans, poppins, quicksand, raleway, rethink-sans, righteous, roboto, roboto-condensed, roboto-mono, roboto-slab, rubik, satisfy, shadows-into-light, shantell-sans, short-stack, sora, source-serif-4, space-grotesk, space-mono, unbounded, urbanist, vollkorn, work-sans, zcool-kuaile, zcool-qingke-huangyou, zcool-xiaowei) | yes | Chooses the catalog family this fallback face is taken from. |
| `weight` | literal | yes | Chooses the fallback face's exact weight, which the family must publish. |
| `style` | literal (normal, italic) | yes | Chooses the fallback face's exact style, which the family must publish. |

```svml
<fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
</fonts:Stack>
```

A `<Fallback>` is empty; it accepts no children and no text.

`emoji="color"` selects the COLRv1 face and `emoji="mono"` the weight-400 monochrome face; omitting `emoji` adds no bytes.

The FontStack is published under the bare `id`, and the element carries no text content.

## `@hypit/gemini-omni@1`

### `<Video>`

One Gemini Omni video generation: an exact request sealed from a written prompt and bounded references, and the video Artifact it produces.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation so its video can be referenced elsewhere in the Source. |
| `prompt` | reference (@hypit/text@1#Text) | yes | Selects the Text the model generates from. |
| `duration` | literal (4, 6, 8, 10) | yes | Fixes the generated video's length in seconds. |
| `aspect-ratio` | literal (16:9, 9:16) | yes | Fixes the generated video's frame shape. |
| `resolution` | literal (720p, 1080p, 4k) | yes | Fixes the generated video's resolution. |
| `seed` | literal | no | Fixes the sampling seed so the same request generates the same video. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Image>` | many | Attaches one image Artifact as a visual reference. |
| `<Excerpt>` | optional | Attaches one exact time range of a video Artifact as a motion reference. |
| `<AudioId>` | many | Carries one opaque service audio identity as a scalar request value. |
| `<CharacterId>` | many | Carries one opaque service character identity as a scalar request value. |

`<Image>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the image Blob this reference carries. |

`<Excerpt>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `video` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the video Blob the range is taken from. |
| `start-sec` | literal | yes | Fixes where the referenced range begins, in seconds from the video's start. |
| `end-sec` | literal | yes | Fixes where the referenced range ends, in seconds from the video's start. |

`<AudioId>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `value` | literal | yes | Fixes the audio identity the service resolves. |

`<CharacterId>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `value` | literal | yes | Fixes the character identity the service resolves. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The generated video, selected as the primary result of the generation. |

```svml
<omni:Video id="scene" prompt={prompt} duration="8" aspect-ratio="9:16" resolution="1080p" seed="42">
  <omni:Image image={person.image}/>
  <omni:Excerpt video={reference.video} start-sec="1.5" end-sec="4"/>
  <omni:AudioId value="voice-id"/>
  <omni:CharacterId value="character-id"/>
</omni:Video>
```

Every child is written empty and carries its whole meaning in attributes.

`Image` reads an image Blob and `Excerpt` a video Blob; the media type is checked when the referenced Record is known at compile time.

`Excerpt` requires `start-sec` to be before `end-sec`.

The element accepts at most seven `Image` children, at most one `Excerpt` child and at most three `AudioId` and three `CharacterId` children.

`Image`, `Excerpt` and `CharacterId` share one reference budget of seven, in which an Excerpt costs two.

The element carries no text content, and the package calls no API — the selected Runtime Endpoint fulfills the generation.

## `@hypit/gpt-image@1`

### `<Image>`

Generates one picture with the exact GPT Image 2 model from a Text prompt and optional reference images.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the bindings it publishes. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the picture the model renders. |
| `aspect-ratio` | literal (auto, 1:1, 3:2, 2:3, 4:3, 3:4, 5:4, 4:5, 16:9, 9:16, 2:1, 1:2, 3:1, 1:3, 21:9, 9:21) | yes | The shape of the generated picture. |
| `resolution` | literal (1K, 2K, 4K) | yes | The size band the model renders at. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one image Artifact as a reference picture. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the image Artifact this reference contributes. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The primary generated image, addressed as `<id>.image`. |

```svml
<gpt:Image
  id="holding"
  prompt={prompt}
  aspect-ratio="9:16"
  resolution="2K"
>
  <gpt:Reference image={person.image}/>
  <gpt:Reference image={product.image}/>
</gpt:Image>
```

The element accepts at most 16 `Reference` children and no text content.

Every `Reference` is an ordinary image Artifact edge; the Surface copies no runtime media into request metadata.

### `<Image>`

Generates one picture with the exact GPT Image 2 model and runs the official denoise Program over it.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the bindings it publishes. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the picture the model renders. |
| `aspect-ratio` | literal (auto, 1:1, 3:2, 2:3, 4:3, 3:4, 5:4, 4:5, 16:9, 9:16, 2:1, 1:2, 3:1, 1:3, 21:9, 9:21) | yes | The shape of the generated picture. |
| `resolution` | literal (1K, 2K, 4K) | yes | The size band the model renders at. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one image Artifact as a reference picture. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the image Artifact this reference contributes. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The cleaned image, addressed as `<id>.image`. |

```svml
<gpt:Image
  id="holding"
  prompt={prompt}
  aspect-ratio="9:16"
  resolution="2K"
>
  <gpt:Reference image={person.image}/>
  <gpt:Reference image={product.image}/>
</gpt:Image>
```

The element accepts at most 16 `Reference` children and no text content.

Every `Reference` is an ordinary image Artifact edge; the Surface copies no runtime media into request metadata.

Generation and the image-transform Need stay two visible operations in the graph.

## `@hypit/grok-imagine@1`

### `<PreviewVideo>`

Generates one video Artifact from a Text prompt and up to four reference images with the Grok Imagine 1.5 preview video model.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation so its video Artifact can be referenced elsewhere in the Source. |
| `prompt` | reference (@hypit/text@1#Text) | yes | Selects the Text the model generates from. |
| `duration` | literal | yes | Sets the length of the generated video in whole seconds. |
| `aspect-ratio` | literal (2:3, 3:2, 1:1, 16:9, 9:16) | yes | Sets the width-to-height ratio of the generated video. |
| `resolution` | literal (480p, 720p, 1080p) | yes | Sets the picture height of the generated video. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one image Artifact the model generates from. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the image Artifact this reference contributes. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The generated video Artifact. |

```svml
<grok:PreviewVideo id="preview" prompt={previewPrompt} duration="6" aspect-ratio="9:16" resolution="720p"/>
```

`Reference` accepts only an `image` reference to an image Blob, is empty, and repeats at most four times.

`duration` is a whole number of seconds between 6 and 30.

The preview model has no continuation port, so `source-task-id` belongs to `Video` alone.

The element carries no text content.

### `<Video>`

Generates one video Artifact from a Text prompt and up to four reference images with the Grok Imagine video model.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation so its video Artifact can be referenced elsewhere in the Source. |
| `prompt` | reference (@hypit/text@1#Text) | yes | Selects the Text the model generates from. |
| `duration` | literal | yes | Sets the length of the generated video in whole seconds. |
| `aspect-ratio` | literal (2:3, 3:2, 1:1, 16:9, 9:16) | yes | Sets the width-to-height ratio of the generated video. |
| `resolution` | literal (480p, 720p, 1080p) | yes | Sets the picture height of the generated video. |
| `source-task-id` | literal | no | Continues an earlier Grok Imagine generation named by its task identifier. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one image Artifact the model generates from. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the image Artifact this reference contributes. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The generated video Artifact. |

```svml
<grok:Video id="clip" prompt={prompt} duration="6" aspect-ratio="9:16" resolution="720p">
  <grok:Reference image={person.image}/>
</grok:Video>
```

`Reference` accepts only an `image` reference to an image Blob, is empty, and repeats at most four times.

`duration` is a whole number of seconds between 6 and 30.

`source-task-id` requires at least one `Reference`; the continuation resumes from the images it names.

The element carries no text content.

## `@hypit/image-compose@1`

### `<Image>`

Paints ordered image Layers onto one Canvas and publishes the composed picture as an image Artifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this composition so its image can be referenced elsewhere in the Source. |
| `canvas` | reference (@hypit/spatial@1#CanvasSpace) | yes | Chooses the Canvas every Layer is painted onto. |
| `background` | literal | no | Sets the color the Canvas is cleared to before the first Layer is painted. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Layer>` | many | One image painted into its own Frame, in document order, and empty of children and text. |

`<Layer>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `source` | reference (@hypit/artifact@1#BlobArtifact) | yes | Chooses the image Artifact this Layer paints. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame on the Canvas the image is painted into. |
| `fit` | literal (contain, cover, stretch) | no | Decides how the image is sized to its Frame; defaults to `contain`. |
| `interpolation` | literal (nearest, linear, cubic, area, lanczos) | no | Decides which filter resamples the image while it is scaled; defaults to `lanczos`. |
| `opacity` | literal | no | Sets how strongly this Layer covers what is beneath it, from 0 to 1; defaults to 1. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The composed picture, a PNG. |

```svml
<compose:Image id="card" canvas={portrait} background="#00000000">
  <compose:Layer source={background.image} frame={full} fit="cover"/>
  <compose:Layer source={product.image} frame={product-frame} fit="contain"/>
</compose:Image>
```

`background` is written as `#RRGGBBAA` and defaults to `#00000000`.

The composition requires at least one Layer and holds at most 64.

Child order is paint order, and a Frame that extends beyond the Canvas is clipped.

## `@hypit/image-transform@1`

### `<Program>`

Names an ordered list of raster operations and publishes it as a reusable ImageTransformProgram Record.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the ImageTransformProgram Record this element publishes. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Crop>` | many | Cuts a rectangle out of the image, measured in fractions of the frame or in pixels. |
| `<Resize>` | many | Scales the image to a pixel width and height under one fit rule. |
| `<Rotate>` | many | Turns the image by 90, 180 or 270 degrees. |
| `<Flip>` | many | Mirrors the image across one axis. |
| `<Denoise>` | many | Removes noise with YCrCb non-local means and recovers saturation. |
| `<Color>` | many | Adjusts exposure, contrast, saturation, temperature, tint and gamma. |
| `<Sharpen>` | many | Sharpens edges by an amount over a radius, above a threshold. |
| `<Blur>` | many | Blurs the image by one sigma. |
| `<Alpha>` | many | Keeps the alpha channel or flattens it onto a background color. |
| `<Encode>` | optional | Encodes the result as PNG, JPEG or WebP. |

`<Crop>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `unit` | literal (fraction, pixel) | no | Decides whether the rectangle is measured in fractions of the frame or in pixels; defaults to `fraction`. |
| `x` | literal | yes | Sets the left edge of the rectangle. |
| `y` | literal | yes | Sets the top edge of the rectangle. |
| `width` | literal | yes | Sets how wide the rectangle is. |
| `height` | literal | yes | Sets how tall the rectangle is. |

`<Resize>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `width` | literal | yes | Sets the width in whole pixels the image is scaled to. |
| `height` | literal | yes | Sets the height in whole pixels the image is scaled to. |
| `fit` | literal (contain, cover, stretch) | no | Decides how the image is sized into that width and height; defaults to `contain`. |
| `interpolation` | literal (nearest, linear, cubic, area, lanczos) | no | Decides which filter resamples the image while it is scaled; defaults to `lanczos`. |
| `background` | literal | no | Sets the hexadecimal color filling the area `contain` leaves empty. |

`<Rotate>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `degrees` | literal (90, 180, 270) | yes | Sets how far the image is turned clockwise. |

`<Flip>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `axis` | literal (horizontal, vertical, both) | no | Chooses the axis the image is mirrored across; defaults to `horizontal`. |

`<Denoise>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `method` | literal (nlm-ycrcb) | no | Names the denoising method; defaults to `nlm-ycrcb`. |
| `luma` | literal | no | Sets how hard the luma channel is denoised; defaults to 2. |
| `chroma` | literal | no | Sets how hard the chroma channels are denoised; defaults to 10. |
| `template-window` | literal | no | Sets the odd pixel width of the patch each pixel is compared as; defaults to 7. |
| `search-window` | literal | no | Sets the odd pixel width of the area searched for similar patches; defaults to 21. |
| `saturation-recovery` | literal | no | Sets how much saturation is restored after denoising dulls it; defaults to 1.02. |

`<Color>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `exposure-stops` | literal | no | Shifts overall brightness in photographic stops; defaults to 0. |
| `contrast` | literal | no | Scales the distance of each pixel from mid grey; defaults to 1. |
| `saturation` | literal | no | Scales color intensity, where 0 is greyscale; defaults to 1. |
| `temperature` | literal | no | Shifts the image between blue and amber; defaults to 0. |
| `tint` | literal | no | Shifts the image between green and magenta; defaults to 0. |
| `gamma` | literal | no | Bends the tone curve between shadows and highlights; defaults to 1. |

`<Sharpen>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `amount` | literal | no | Sets how strongly edge contrast is raised; defaults to 0.5. |
| `radius` | literal | no | Sets how far either side of an edge the sharpening reaches; defaults to 1. |
| `threshold` | literal | no | Sets the edge contrast below which pixels are left alone; defaults to 0. |

`<Blur>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `sigma` | literal | yes | Sets the radius of the Gaussian blur. |

`<Alpha>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `mode` | literal (preserve, flatten) | no | Decides whether transparency survives or is painted over; defaults to `preserve`. |
| `background` | literal | no | Sets the hexadecimal color transparency is flattened onto. |

`<Encode>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `format` | literal (png, jpeg, webp) | no | Chooses the container the result is written as; defaults to `png`. |
| `quality` | literal | no | Sets the lossy encoding quality from 1 to 100. |
| `background` | literal | no | Sets the hexadecimal color an opaque format is written over. |

```svml
<image:Program id="clean-gpt-image">
  <image:Denoise/>
  <image:Encode format="png"/>
</image:Program>
```

Operation order is author meaning: the operations run in the order they are written, and a Program requires at least one.

In `fraction` a `Crop` measures 0 to 1 and must stay inside the source image; in `pixel` its origin and size are whole pixels.

A `Denoise` needs odd windows, with `search-window` wider than `template-window`, and runs on its defaults alone.

`Alpha` requires `background` when `mode` is `flatten` and refuses it when `mode` is `preserve`.

`Encode` may appear only once and must be written last; `quality` is refused by `png`, and `background` is accepted only by `jpeg`.

The ImageTransformProgram Record is published under the bare `id`, and the element carries no text content.

### `<Transform>`

Runs one ImageTransformProgram over a source image Artifact and publishes the transformed image.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this transform so its image can be referenced elsewhere in the Source. |
| `source` | reference (@hypit/artifact@1#BlobArtifact) | yes | Chooses the image the operations are applied to. |
| `program` | reference (@hypit/image-transform@1#ImageTransformProgram) | yes | Chooses the ImageTransformProgram whose operations run over the source. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The transformed image, addressed as `<id>.image`. |

```svml
<image:Transform id="clean-shot" source={shot.image} program={clean-gpt-image}/>
```

The element is empty; it accepts no children and no text.

The published image is the transformed image itself, carrying no source digest, Provider name or copied upstream metadata.

A Program on its own produces no image; naming it here is what runs it.

## `@hypit/media-pipeline@1`

### `<ExtractAudio>`

Extracts one audio stream from a BlobArtifact as a deterministic 48 kHz stereo PCM WAV Artifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the extraction request Record and the extracted audio this element publishes. |
| `source` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the media Artifact this element extracts audio from. |
| `audio` | literal | yes | Decides which audio stream is extracted: `default` or `stream:<index>`. |

| Port | Type | Meaning |
|---|---|---|
| `audio` | @hypit/artifact@1#BlobArtifact | The extracted WAV Artifact, addressed as `<id>.audio`. |

```svml
<media:ExtractAudio id="voice-reference" source={prepared.video} audio="default"/>
```

The element accepts no children and no text content, and the output container, codec, sample rate and channel count are fixed.

The result makes no SpeechBasis, speaker or alignment claim, so it can feed a model reference port directly.

### `<ExtractFrame>`

Extracts one still frame from a BlobArtifact as a PNG Artifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the extraction request Record and the extracted image this element publishes. |
| `source` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the media Artifact this element extracts a frame from. |
| `video` | literal | yes | Decides which moving-image stream the frame is taken from: `primary-moving` or `stream:<index>`. |
| `at` | literal | yes | Decides which frame is taken: `first`, `last`, `frame:<index>` or `time:<seconds>`. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The extracted PNG Artifact, addressed as `<id>.image`. |

```svml
<media:ExtractFrame id="continuity" source={prepared.video} video="primary-moving" at="last"/>
```

The element accepts no children and no text content, and the output format is fixed to PNG.

`time:<seconds>` is written as a non-negative number with an optional `s`, such as `time:0.25s`.

### `<Normalize>`

Inspects one BlobArtifact, selects its video and audio streams and normalizes them into SynchronizedMedia on one frame domain.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the selection Record and the normalized media this element publishes. |
| `source` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the media Artifact this element inspects and normalizes. |
| `video` | literal | yes | Decides which moving-image stream is carried: `primary-moving`, `none`, or `stream:<index>`. |
| `audio` | literal | yes | Decides which audio stream is carried: `default`, `none`, or `stream:<index>`. |
| `span-authority` | literal (video, audio) | yes | Decides which selected stream defines the extent the other is trimmed or padded to. |
| `frame-rate` | literal | yes | Decides the exact rational frame rate of the common frame domain, such as `30` or `30000/1001`. |

| Port | Type | Meaning |
|---|---|---|
| `media` | @hypit/media@1#SynchronizedMedia | The normalized SynchronizedMedia, addressed as `<id>.media`. |

```svml
<pipeline:Normalize id="music-media" source={music}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>
```

All six attributes are required; the element accepts no children and no text content.

`primary-moving` excludes attached-picture streams, prefers one declared default and fails closed on an ambiguous container; `stream:<index>` is for a container the author genuinely knows.

Selecting embedded audio is a media fact only and makes no SpeechBasis, speaker or alignment claim.

### `<Transform>`

Normalizes one BlobArtifact and runs an ordered trim and retime program over it, publishing the transformed video Artifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the selection Record, the transform program Record and the transformed video this element publishes. |
| `source` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the media Artifact this element transforms. |
| `video` | literal | yes | Decides which moving-image stream is transformed: `primary-moving` or `stream:<index>`. |
| `audio` | literal | yes | Decides which audio stream travels with the transform: `default`, `none`, or `stream:<index>`. |
| `span-authority` | literal (video) | yes | Decides which selected stream defines the extent, and a transform is always authored against video. |
| `frame-rate` | literal | yes | Decides the exact rational frame rate the transform runs on, such as `30` or `30000/1001`. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Trim>` | many | Removes time from the head or the tail, taking at least one of `start`, `end` or `tail` in seconds. |
| `<Retime>` | many | Changes playback speed by `rate` in the range (0, 100] while `pitch` holds the original pitch. |

`<Trim>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `start` | literal | no | Decides where the kept span begins, as seconds from the current start, such as `0.25s` or `2`. |
| `end` | literal | no | Decides where the kept span ends, as positive seconds from the current start. |
| `tail` | literal | no | Decides how many seconds are removed from the current end. |

`<Retime>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `rate` | literal | yes | Decides the playback speed multiplier, above `0` and at most `100`. |
| `pitch` | literal (preserve) | yes | Decides how pitch follows the speed change, and the one spelling keeps the original pitch. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The transformed media Artifact, addressed as `<id>.video`. |

```svml
<media:Transform id="prepared" source={shot.video}
  video="primary-moving" audio="default" span-authority="video" frame-rate="30">
  <media:Trim tail="0.25s"/>
  <media:Retime rate="1.05" pitch="preserve"/>
</media:Transform>
```

At least one `Trim` or `Retime` child is required, and children run in the order they are written.

`Trim` cannot combine `end` and `tail`, and both children are written empty.

`video` cannot be `none`, and the operations are author meaning rather than an arbitrary FFmpeg string.

## `@hypit/media-track@1`

### `<Track>`

One Media Track: independently timed Items and replacement Sequences placed on a shared ProgramSpace and Canvas, lowered to one peer VisualTrack and, when audio is authored, one peer AudioTrack.

**On screen.** Rectangular pictures, each filling its own Frame exactly where that Frame sits on the Canvas, and nothing besides: the Track draws no chrome, caption or backdrop of its own, and lays nothing out relative to anything else. Inside one Frame the layers stack back to front in the order they are written — flat or gradient Paint fills, then a still image, a video or a Surface scaled in by the fit — clipped to the Frame as a square, a rounded rectangle or an authored Path, optionally ringed by a border and sitting on drop shadows. An Item appears for its own window and leaves at the end of it, entering and exiting on one operator such as a fade, a slide from an edge, a scale, a pop or a wipe, holding a small continuous float, pulse or drift while it is up, and panning, zooming or rotating its picture inside the Frame across the window. A Sequence instead keeps one Frame occupied without a break and replaces the picture inside it at each activation point, the outgoing picture giving way on a cut, a crossfade, a push, a wipe, a cover or a page-turn; where two units overlap, the higher stack order draws in front.

**Preview.** `preview/Track.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Track and prefixes the identity of every Item, Sequence, layer and sound that does not name itself. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Fixes the frame domain every window resolves into and the consumption policy raw video is normalized against. |
| `canvas` | reference (@hypit/spatial@1#CanvasSpace) | yes | Chooses the Canvas every Frame on this Track is measured inside. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the SemanticMap that turns semantic identity into exact time. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Item>` | many | One independently timed picture on its own Frame, from a direct source or ordered Paint and Layer children, carrying its own Sampling and Sound children. |
| `<Sequence>` | many | One Frame whose Members replace each other at explicit activation points, written as ordered Member, Handoff and Sound children. |

`<Item>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this Item; the Track derives `<track>.item.<index>` when it is absent. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame the Item occupies on the Canvas. |
| `appearance` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe for fitting, source occupancy, frame Paint, clipping, borders and shadows, and the Recipe every sample Layer falls back to. |
| `motion` | reference (@hypit/svs@1#Recipe) | no | Chooses the Recipe for the whole Item's enter, sustain and exit motion. |
| `clip` | reference (@hypit/spatial@1#SpatialPath) | no | Clips the Item to an authored Path. |
| `image` | reference (@hypit/artifact@1#BlobArtifact) | no | Shows a durationless still image as the Item's direct source. |
| `video` | reference (@hypit/artifact@1#BlobArtifact) | no | Shows a raw video the Track inspects, selects and normalizes against its `space`. |
| `media` | reference (@hypit/media@1#SynchronizedMedia) | no | Shows an explicitly prepared timed source. |
| `surface` | reference (@hypit/media@1#CompositableSurfaceRef) | no | Shows an alpha-aware still or timed Surface. |
| `extent` | reference (@hypit/spatial@1#IntrinsicExtent) | no | Gives the still image its authored pixel Extent. |
| `audio` | literal (include, omit) | no | Decides whether a raw `video` source contributes its own audio; defaults to `omit`. |
| `source-audio` | literal | no | Names the layer whose source audio this Item emits. |
| `audio-gain` | literal | no | Scales the selected source audio by a linear gain; defaults to `1`. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection, @hypit/narrative@1#NarrativeExcerpt) | no | Spans the whole program when written as `program`, or the window of the referenced Selection or Segment. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the window at the cue of the referenced Moment. |
| `for` | literal | no | Fixes the exact length of a Moment window, such as `12f`, `250ms` or `1.5s`. |
| `start` | literal | no | Places the window start at a point expression. |
| `end` | literal | no | Places the window end at a point expression. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds the Selection that resolves `selection.start` and `selection.end` in a start/end window. |
| `segment` | reference (@hypit/narrative@1#NarrativeExcerpt) | no | Binds the Segment that resolves `segment.start` and `segment.end` in a start/end window. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds the Moment that resolves `moment.cue` in a start/end window. |
| `occurrences` | literal (one, each) | no | Decides whether a semantic source contributes one window or every occurrence; defaults to `one`. |

`<Sequence>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this Sequence; the Track derives `<track>.sequence.<index>` when it is absent. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame every Member occupies. |
| `appearance` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe for fitting, frame Paint, clipping, borders and shadows, and the Recipe every Member falls back to. |
| `motion` | reference (@hypit/svs@1#Recipe) | no | Chooses the Recipe for the whole Sequence's enter, sustain and exit motion. |
| `clip` | reference (@hypit/spatial@1#SpatialPath) | no | Clips the Sequence to an authored Path. |
| `until` | expression (program.end, @hypit/narrative@1#NarrativeMoment, @hypit/narrative@1#NarrativeSelection) | yes | Ends the Sequence at the literal `program.end`, at a Moment, or at a Selection. |
| `until-boundary` | literal (start, end) | no | Chooses which edge of the ending Selection ends the Sequence; defaults to `end`. |

| Port | Type | Meaning |
|---|---|---|
| `visual` | @hypit/composition@1#VisualTrack | The rendered picture, an ordinary peer VisualTrack. |
| `audio` | @hypit/composition@1#AudioTrack | The rendered sound, published only when a source audio selection or a Sound is authored. |

```svml
<media-track:Track id="cutaways" map={timing.map} space={speech.space} canvas={vertical}>
  <media-track:Item id="bags" video={cutaway-bags.video} during={story.selection.bags}
    frame={full} appearance={studio.media.cutaway} motion={studio.motion.cut}/>
</media-track:Track>
```

A Track requires at least one Item or Sequence, accepts no text content, and refuses `map` when no child consumes semantic timing.

An Item states exactly one window form: `during`, `at` with `for`, or `start` with `end`; `selection`, `segment` and `moment` bind a start/end window and cannot be written together.

A point expression is `program.start`, `program.end`, `selection.start`, `selection.end`, `segment.start`, `segment.end` or `moment.cue`, each optionally offset by `+` or `-` and a duration, or a bare duration read as an absolute position.

A unit that names a direct source names exactly one of `image`, `video`, `media` or `surface`; `extent` is required with `image` and refused otherwise, and `audio` is only valid with `video`.

`audio-gain` is refused without selected source audio.

`clip` is refused on an Item or Sequence whose Recipe already states a clip.

An `appearance` or `motion` Recipe is refused when it carries a property outside its own set.

`playback`, `trim-start` and `trim-end` are refused on durationless still material, and `trim-start` and `trim-end` are written together or not at all.

An `enter` or an `exit` operator requires its own `enter-frames` or `exit-frames`.

An Item written with a direct source accepts `<Sampling>` and `<Sound>` children; an Item written without one accepts `<Paint>`, `<Layer>` and `<Sound>` children, and requires at least one Paint or Layer.

A Sequence requires at least two `<Member>` children, exactly one `<Handoff>` for every adjacent Member pair, and accepts `<Sound>` children.

`until-boundary` is refused for `program.end` and for a Moment.

A Member is one picture in the replacement order:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this Member; the Sequence derives `<sequence>.member.<index>` otherwise |
| `at` | reference (@hypit/narrative@1#NarrativeMoment, @hypit/narrative@1#NarrativeSelection) | yes | The Moment or Selection that activates this Member |
| `boundary` | literal (start, end) | with a Selection | Which edge of the activating Selection the Member starts on; refused for a Moment |
| `appearance` | reference (@hypit/svs@1#Recipe) | no | This Member's own Recipe in place of the Sequence's |
| `image` | reference (@hypit/artifact@1#Blob) | one source form | A durationless still image, which also requires `extent` |
| `video` | reference (@hypit/artifact@1#Blob) | one source form | A raw video the Track inspects, selects and normalizes against its `space` |
| `media` | reference (@hypit/media@1#SynchronizedMedia) | one source form | An explicitly prepared timed source |
| `surface` | reference (@hypit/media@1#CompositableSurfaceRef) | one source form | An alpha-aware still or timed Surface |
| `extent` | reference (@hypit/spatial@1#IntrinsicExtent) | with `image` | The authored pixel extent of the still image |
| `audio` | literal (include, omit) | no | Whether a raw `video` source contributes its own audio; defaults to `omit` |
| `source-audio` | literal | no | Names the layer whose source audio this Member emits |
| `audio-gain` | literal | with selected source audio | Linear gain applied to the selected source audio; defaults to `1` |

A Member written with a direct source accepts `<Sampling>` children; a Member written without one accepts `<Paint>` and `<Layer>` children, and requires at least one of them.

A Member `appearance` Recipe accepts the same properties as its Sequence's, of which the fit properties, the sample properties and `frame-paint` are read; clipping, padding, borders, shadows and `stack-order` stay with the Sequence Recipe.

A Handoff is written empty and carries the transition between one Member pair:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this Handoff; the Sequence derives `<sequence>.handoff.<index>` otherwise |
| `from` | literal | yes | The id of the outgoing Member, which must be the Member preceding this Handoff |
| `transition` | reference (@hypit/svs@1#Recipe) | yes | The Recipe for the handoff operator, its length, its boundary and its audio treatment |

A `transition` Recipe carries exactly these properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `operator` | yes | — | How the outgoing Member gives way to the incoming one. One of cut, crossfade, push, wipe, cover, page-turn. |
| `duration-frames` | yes | — | How many frames the handoff runs. |
| `boundary-ratio` | no | `0.5` | Where the activation point sits inside the handoff, from 0 at its first frame to 1 at its last. |
| `direction` | no | — | Points a directional handoff the way it travels. One of left, right, up, down. |
| `audio` | no | `cut` | Decides whether source audio cuts or crossfades across the handoff. One of cut, crossfade. |

A Paint child is written empty and paints one layer:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this layer; the Track derives one from the unit and the layer position otherwise |
| `appearance` | reference (@hypit/svs@1#Recipe) | yes | The solid or gradient paint and the opacity this layer is filled with |

A Paint `appearance` Recipe carries exactly these properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `paint` | yes | — | Fills the layer with a color, `linear(angle;stops)` or `radial(x,y;stops)`, each gradient carrying at least two `color@offset` stops. |
| `opacity` | no | `1` | Sets how opaque the fill is drawn. |

A Layer child samples one source into the unit's Frame:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this layer, which `source-audio` selects by; the Track derives one from the unit and the layer position otherwise |
| `image` | reference (@hypit/artifact@1#Blob) | one source form | A durationless still image, which also requires `extent` |
| `video` | reference (@hypit/artifact@1#Blob) | one source form | A raw video the Track inspects, selects and normalizes against its `space` |
| `media` | reference (@hypit/media@1#SynchronizedMedia) | one source form | An explicitly prepared timed source |
| `surface` | reference (@hypit/media@1#CompositableSurfaceRef) | one source form | An alpha-aware still or timed Surface |
| `extent` | reference (@hypit/spatial@1#IntrinsicExtent) | with `image` | The authored pixel extent of the still image |
| `audio` | literal (include, omit) | no | Whether a raw `video` source contributes its own audio; defaults to `omit` |
| `appearance` | reference (@hypit/svs@1#Recipe) | no | This layer's own Recipe in place of the unit's |

A Layer `appearance` Recipe carries the fit properties and the sample properties and nothing else, so a Layer states its own Recipe rather than inheriting the unit's, which requires `stack-order`.

A Sampling child is written empty and states one keyframe of sampling motion:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `at` | literal | yes | Where the keyframe sits in the unit's window, written as `start`, `end` or a percentage inside `0%`..`100%` |
| `zoom` | literal | no | The sampling scale at this keyframe; defaults to `1` |
| `x` | literal | no | The horizontal sampling offset at this keyframe; defaults to `0` |
| `y` | literal | no | The vertical sampling offset at this keyframe; defaults to `0` |
| `rotate` | literal | no | The sampling rotation in degrees at this keyframe; defaults to `0` |
| `easing` | literal (linear, ease-in, ease-out, ease-in-out) | no | How the sampling moves out of this keyframe |

A Sound child is written empty and plays one prepared source on one trigger:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this sound; the Track derives one from the unit and the sound position otherwise |
| `source` | reference (@hypit/media@1#SynchronizedMedia) | yes | The explicitly prepared audio this sound plays |
| `at` | literal (enter, exit) | one trigger form | Plays the sound as the unit enters or as it exits |
| `handoff` | literal | one trigger form | Plays the sound on the named Handoff of the surrounding Sequence |
| `gain` | literal | no | Linear gain applied to this sound; defaults to `1` |

A Sound states exactly one trigger form, and `handoff` only names a Handoff of the Sequence it is written in.

A direct source is sampled into a layer named `content`, so `audio="include"` on a direct video selects that audio itself and refuses `source-audio` beside it.

## `@hypit/media@1`

### `<Audio>`

Requests one authored audio file from the Host and publishes it as a content-addressed Artifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Artifact Record this element publishes. |
| `src` | literal | yes | Points at the audio file, resolved by the Host against the source that declares it. |
| `media-type` | literal | no | States the audio media type when the src extension does not name one. |

```svml
<media:Audio id="music" src="./assets/music.wav"/>
```

The element is empty; it accepts no children and no text.

`.aac`, `.flac`, `.m4a`, `.mp3`, `.oga`, `.ogg`, `.opus` and `.wav` name their own media type; any other file needs `media-type`.

A written `media-type` must begin with `audio/`, and the resolved bytes must arrive as an audio Artifact.

The Artifact is published under the bare `id`; declared audio is not promoted to speech here.

### `<Font>`

Requests one authored font file from the Host and publishes it with its exact weight and style as a one-source FontArtifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the FontArtifact Record this element publishes. |
| `src` | literal | yes | Points at the font file, resolved by the Host against the source that declares it. |
| `weight` | literal | yes | States the exact weight the bytes carry, as a whole number from 1 to 1000. |
| `style` | literal (normal, italic, oblique) | yes | States the exact style the bytes carry. |
| `media-type` | literal | no | States the font media type when the src extension does not name one. |

```svml
<media:Font id="brand" src="./assets/Brand-Semibold.woff2" weight="600" style="normal"/>
```

The element is empty; it accepts no children and no text.

`.otf`, `.ttf`, `.woff` and `.woff2` name their own media type; any other file needs `media-type`.

One element declares one face, so `weight` and `style` describe these bytes rather than a family.

The FontArtifact is published under the bare `id`, and an invalid weight or style fails before any bytes are read.

### `<Image>`

Requests one authored image file from the Host and publishes it as a content-addressed Artifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Artifact Record this element publishes. |
| `src` | literal | yes | Points at the image file, resolved by the Host against the source that declares it. |
| `media-type` | literal | no | States the image media type when the src extension does not name one. |

```svml
<media:Image id="presenter" src="./assets/presenter.png"/>
```

The element is empty; it accepts no children and no text.

`.avif`, `.gif`, `.jpeg`, `.jpg`, `.png` and `.webp` name their own media type; any other file needs `media-type`.

A written `media-type` must begin with `image/`, and the resolved bytes must arrive as an image Artifact.

The Artifact is published under the bare `id`, and the consuming package decides what the image means.

## `@hypit/mimo-tts@1`

### `<Preset>`

Speaks a Text with one of the built-in MiMo voices.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this synthesis and prefixes the bindings it publishes. |
| `speech` | reference (@hypit/text@1#Text) | yes | The Text edge whose exact words the model speaks. |
| `voice` | literal (冰糖, 茉莉, 苏打, 白桦, Mia, Chloe, Milo, Dean) | yes | The built-in voice that reads the speech. |

The element's own text is an optional delivery instruction; leaving it empty sends no instruction.

| Port | Type | Meaning |
|---|---|---|
| `audio` | @hypit/artifact@1#BlobArtifact | The synthesized speech, addressed as `<id>.audio`. |

```svml
<mimo:Preset id="narration" speech={story.segment.opening.speech} voice="Chloe">
  Warm, direct and conversational.
</mimo:Preset>
```

The element accepts no child elements; only its text is read.

`speech` stays an ordinary Text edge attached at execution time, so the Frontend copies no Script words into the request draft.

### `<VoiceClone>`

Speaks a Text with the voice heard in one audio Artifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this synthesis and prefixes the bindings it publishes. |
| `speech` | reference (@hypit/text@1#Text) | yes | The Text edge whose exact words the model speaks. |
| `sample` | reference (@hypit/artifact@1#BlobArtifact) | yes | The audio Artifact whose voice the model reproduces. |

The element's own text is an optional delivery instruction; leaving it empty sends no instruction.

| Port | Type | Meaning |
|---|---|---|
| `audio` | @hypit/artifact@1#BlobArtifact | The synthesized speech, addressed as `<id>.audio`. |

```svml
<mimo:VoiceClone id="cloned" speech={story.segment.payoff.speech} sample={presenter.audio}>
  Calm and restrained.
</mimo:VoiceClone>
```

The element accepts no child elements; only its text is read.

An authored `sample` whose media type is not audio is refused before any Need exists.

### `<VoiceDesign>`

Speaks a Text with a voice the element describes in words rather than names.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this synthesis and prefixes the bindings it publishes. |
| `speech` | reference (@hypit/text@1#Text) | yes | The Text edge whose exact words the model speaks. |

The element's own text is the voice description and is required.

| Port | Type | Meaning |
|---|---|---|
| `audio` | @hypit/artifact@1#BlobArtifact | The synthesized speech, addressed as `<id>.audio`. |

```svml
<mimo:VoiceDesign id="designed" speech={story.segment.answer.speech}>
  A clear young woman with a grounded, confident delivery.
</mimo:VoiceDesign>
```

The element accepts no child elements; only its text is read.

An empty body is refused, because this model has no voice to fall back on.

## `@hypit/minimax-h3@1`

### `<FrameVideo>`

Generates one video Artifact that opens on a given image and optionally closes on a second image with the MiniMax H3 model.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation so its video Artifact can be referenced elsewhere in the Source. |
| `prompt` | reference (@hypit/text@1#Text) | yes | Selects the Text the model generates from. |
| `duration` | literal | yes | Sets the length of the generated video in whole seconds. |
| `resolution` | literal (768P, 2K) | no | Chooses which of the model's two output tiers renders the video. |
| `first-frame` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the image Artifact the generated video opens on. |
| `last-frame` | reference (@hypit/artifact@1#BlobArtifact) | no | Selects the image Artifact the generated video closes on. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The generated video Artifact. |

```svml
<h3:FrameVideo id="motion" prompt={motionPrompt} duration="6" resolution="2K"
  first-frame={cover.image} last-frame={ending.image}/>
```

`duration` is a whole number of seconds between 4 and 15.

`768P` and `2K` are the model's own tiers: H3-Base renders at 768p and H3-Regenerate-2K re-renders from the original context.

A first/last frame run inherits its framing from the given image, so this element takes no `aspect-ratio`.

`first-frame` and `last-frame` reference image Blobs.

The element takes no children and no text content.

### `<ReferenceVideo>`

Generates one video Artifact from a Text prompt and the image, video and audio subjects it carries with the MiniMax H3 model.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation so its video Artifact can be referenced elsewhere in the Source. |
| `prompt` | reference (@hypit/text@1#Text) | yes | Selects the Text the model generates from. |
| `duration` | literal | yes | Sets the length of the generated video in whole seconds. |
| `resolution` | literal (768P, 2K) | no | Chooses which of the model's two output tiers renders the video. |
| `aspect-ratio` | literal (21:9, 16:9, 4:3, 1:1, 3:4, 9:16) | no | Sets the Frame shape of the generated video. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one subject Artifact the model generates from, chosen by an `image`, `video` or `audio` reference. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | no | Selects the image Artifact whose subject the generated video carries. |
| `video` | reference (@hypit/artifact@1#BlobArtifact) | no | Selects the video Artifact whose subject the generated video carries. |
| `audio` | reference (@hypit/artifact@1#BlobArtifact) | no | Selects the audio Artifact the generated video carries. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The generated video Artifact. |

```svml
<h3:ReferenceVideo id="montage" prompt={montagePrompt} duration="8" resolution="768P" aspect-ratio="9:16">
  <h3:Reference image={person.image}/>
  <h3:Reference video={gesture.video}/>
</h3:ReferenceVideo>
```

`duration` is a whole number of seconds between 4 and 15.

`768P` and `2K` are the model's own tiers: H3-Base renders at 768p and H3-Regenerate-2K re-renders from the original context.

`Reference` carries exactly one of `image`, `video` or `audio`, and is empty.

The element requires at least one `Reference`, and accepts at most 9 image, 3 video and 3 audio references and 12 in total.

An audio `Reference` requires an image or video `Reference` beside it.

The element carries no text content.

### `<TextVideo>`

Generates one video Artifact from a Text prompt with the MiniMax H3 model.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation so its video Artifact can be referenced elsewhere in the Source. |
| `prompt` | reference (@hypit/text@1#Text) | yes | Selects the Text the model generates from. |
| `duration` | literal | yes | Sets the length of the generated video in whole seconds. |
| `resolution` | literal (768P, 2K) | no | Chooses which of the model's two output tiers renders the video. |
| `aspect-ratio` | literal (21:9, 16:9, 4:3, 1:1, 3:4, 9:16) | no | Sets the Frame shape of the generated video. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The generated video Artifact. |

```svml
<h3:TextVideo id="idea" prompt={prompt} duration="6" resolution="768P" aspect-ratio="9:16"/>
```

`duration` is a whole number of seconds between 4 and 15.

`768P` and `2K` are the model's own tiers: H3-Base renders at 768p and H3-Regenerate-2K re-renders from the original context.

The element takes no children and no text content.

## `@hypit/nano-banana@1`

### `<Image>`

Generates one picture with the exact Nano Banana 2 model from a Text prompt and optional reference images.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the bindings it publishes. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the picture the model renders. |
| `aspect-ratio` | literal (auto, 1:1, 2:3, 3:2, 1:4, 4:1, 3:4, 4:3, 4:5, 5:4, 1:8, 8:1, 9:16, 16:9, 21:9) | yes | The shape of the generated picture. |
| `resolution` | literal (1K, 2K, 4K) | yes | The size band the model renders at. |
| `output-format` | literal (png, jpg) | yes | The encoding of the returned image Artifact. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one image Artifact as a reference picture. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the image Artifact this reference contributes. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The primary generated image, addressed as `<id>.image`. |

```svml
<nano:Image
  id="draft"
  prompt={prompt}
  aspect-ratio="9:16"
  resolution="2K"
  output-format="png"
>
  <nano:Reference image={person.image}/>
</nano:Image>
```

The element accepts at most 14 `Reference` children and no text content.

Every `Reference` is an ordinary image Artifact edge; the Surface copies no runtime media into request metadata.

The Surface lowers the element into the package's exact model request and selects no Provider.

### `<ProImage>`

Generates one picture with the exact Nano Banana Pro model from a Text prompt and optional reference images.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the bindings it publishes. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the picture the model renders. |
| `aspect-ratio` | literal (auto, 1:1, 2:3, 3:2, 1:4, 4:1, 3:4, 4:3, 4:5, 5:4, 1:8, 8:1, 9:16, 16:9, 21:9) | yes | The shape of the generated picture. |
| `resolution` | literal (1K, 2K, 4K) | yes | The size band the model renders at. |
| `output-format` | literal (png, jpg) | yes | The encoding of the returned image Artifact. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one image Artifact as a reference picture. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | yes | Selects the image Artifact this reference contributes. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The primary generated image, addressed as `<id>.image`. |

```svml
<nano:ProImage
  id="final"
  prompt={finalPrompt}
  aspect-ratio="9:16"
  resolution="4K"
  output-format="png"
/>
```

The element accepts at most 14 `Reference` children and no text content.

Every `Reference` is an ordinary image Artifact edge; the Surface copies no runtime media into request metadata.

The Surface lowers the element into the package's exact model request and selects no Provider.

## `@hypit/ranking@1`

### `<Column>`

Fills a ranked column one row at a time, one on each occurrence of a Moment, and publishes the board and the Tracks it renders to.

**On screen.** One rounded, bordered, shadowed board filling its Frame, carrying an empty slat for every Item from the first frame: a full-width rounded row washed and outlined in that rank's color, with its rank number set at the left end in the same color. The slats sit as one block pushed to the bottom of the board, and a hollow rounded staging square waits near the top of the Frame. Each Item appears inside that square at stage size, then shrinks and slides into its own slat, filling from the top slat downward, one row per trigger occurrence in document order. A filled row reads as its optional icon and then its label, set left-aligned along the slat, and holds there once it settles.

**Preview.** `preview/Column.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this board so its Schedule, Program and Tracks can be referenced elsewhere in the Source. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | yes | Chooses the measured SemanticMap that gives every trigger its frame. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Chooses the ProgramSpace the board is timed and rendered against. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame the whole board occupies. |
| `during` | reference (@hypit/narrative@1#NarrativeSelection) | yes | Chooses the Selection the board is on screen for. |
| `triggers` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment whose occurrences place one ColumnItem each, in document order. |
| `terminal` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment the board settles on and ends after. |
| `style` | reference (@hypit/ranking@1#ColumnStyle) | yes | Chooses the ColumnStyle this board is drawn in, and only that variant's. |
| `appear-sound` | reference (@hypit/media@1#SynchronizedMedia) | no | Chooses the Synchronized Medium played as each row appears. |
| `move-sound` | reference (@hypit/media@1#SynchronizedMedia) | no | Chooses the Synchronized Medium played as a staged row moves into the settled column. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<ColumnItem>` | many | One row of the column, placed at its own trigger occurrence in document order; it is empty. |

`<ColumnItem>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this row within the board; an omitted id is generated from the row's position. |
| `label` | expression (@hypit/text@1#Text) | yes | Sets the row's copy, written literally or chosen from an existing Text. |
| `icon` | reference (@hypit/artifact@1#BlobArtifact) | no | Chooses the image drawn beside the row. |
| `stack` | literal | no | Overrides the Style's draw order for this row alone. |

| Port | Type | Meaning |
|---|---|---|
| `schedule` | @hypit/ranking@1#RankingSchedule | The resolved Schedule: each Item's trigger frame and its staged, cumulative and settled spans. |
| `program` | @hypit/ranking@1#ColumnProgram | The resolved board: its Frame, Style, Schedule and ordered Items. |
| `visual` | @hypit/composition@1#VisualTrack | The rendered board, an ordinary peer VisualTrack. |
| `audio` | @hypit/composition@1#AudioTrack | The rendered board sound, published only when a sound is authored. |

```svml
<ranking:ColumnStyle id="board-style" recipe={studio.ranking.board} font={ui-font}/>
<ranking:Column id="board" map={timing.map} space={speech.space} frame={board-frame}
  during={story.selection.board} triggers={story.moment.place} terminal={story.moment.done}
  style={board-style}>
  <ranking:ColumnItem id="row-regen" label="ReGen" icon={icon-regen}/>
  <ranking:ColumnItem id="row-chatgpt" label="ChatGPT" icon={icon-chatgpt}/>
  <ranking:ColumnItem id="row-remini" label="Remini" icon={icon-remini}/>
</ranking:Column>
```

The board requires at least one ColumnItem, accepts no other child and no text of its own, and Item ids must be unique within it.

A `label` written as a reference materializes the row from that exact Text before the board is scheduled.

Authoring either sound also connects the Style's `.sound` output, so `style` must name a ColumnStyle written in this Source.

### `<ColumnStyle>`

Compiles one SVS Recipe and one exact font into the Style a Column is drawn in, and the private sound Style it connects.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Style so a Column can reference it. |
| `recipe` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe carrying the rank colors, board Paint, row geometry, icon treatment, staging pose and motion. |
| `font` | reference (@hypit/media@1#FontArtifactRef, @hypit/media@1#FontStackRef) | yes | Chooses the exact face, or a whole stack that already carries its own fallbacks, the board copy is set in. |

`recipe` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `rank-colors` | no | `#facc15|#d1d5db|#fb923c|#60a5fa|#a78bfa` | Defines the color each rank badge is drawn in, separated by `|` and reused in order past the last one. |
| `font-size` | no | `28` | Sets the size in pixels the row copy is set at. |
| `font-weight` | no | `700` | Sets the weight the row copy is set at. |
| `text-color` | no | `#ffffff` | Sets the color the row copy is drawn in. |
| `line-height` | no | `1.15` | Sets the line height the row copy is set on, as a multiple of its size. |
| `board-background` | no | `#151821` | Sets the color the board fills with. |
| `board-border-color` | no | `#ffffff33` | Sets the color of the board's border. |
| `board-border-width` | no | `1` | Sets the width in pixels of the board's border. |
| `board-radius` | no | `18` | Sets the corner radius in pixels of the board. |
| `board-shadow-x` | no | `0` | Offsets the board's shadow horizontally in pixels. |
| `board-shadow-y` | no | `10` | Offsets the board's shadow vertically in pixels. |
| `board-shadow-blur` | no | `24` | Sets the blur radius in pixels of the board's shadow. |
| `board-shadow-spread` | no | `0` | Sets the spread in pixels of the board's shadow. |
| `board-shadow-color` | no | `#00000066` | Sets the color of the board's shadow. |
| `appear-frames` | no | `6` | Sets how many frames a row takes to appear. |
| `move-frames` | no | `8` | Sets how many frames a staged row takes to move into the column. |
| `motion-easing` | no | `ease-in-out` | Selects the easing both the appearance and the move are timed with. One of linear, ease-in, ease-out, ease-in-out. |
| `padding` | no | `18` | Sets the inset in pixels between the board's edge and its rows. |
| `row-height` | no | `74` | Sets the height in pixels of one row. |
| `row-gap` | no | `10` | Sets the gap in pixels between rows. |
| `icon-size` | no | `58` | Sets the size in pixels a row's icon is drawn at. |
| `icon-radius` | no | `10` | Sets the corner radius in pixels of a row's icon. |
| `icon-fit` | no | `cover` | Decides whether a row's icon fits inside its box or fills it. One of contain, cover. |
| `stage-x` | no | `0.5` | Places the staging point horizontally, as a fraction of the Frame's width. |
| `stage-y` | no | `0.24` | Places the staging point vertically, as a fraction of the Frame's height. |
| `stage-size` | no | `132` | Sets the size in pixels a staged row is drawn at before it moves in. |
| `board-stack` | no | `20` | Sets the draw order the board itself is placed at. |
| `stage-stack` | no | `25` | Sets the draw order the staging area is placed at. |
| `item-stack` | no | `30` | Sets the draw order every row is placed at, unless the Item overrides it. |
| `appear-gain` | no | `1` | Sets the gain the appear sound is played at. |
| `move-gain` | no | `1` | Sets the gain the move sound is played at. |
| `sound-fade-frames` | no | `0` | Sets how many frames each sound fades in and out over. |

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/ranking@1#ColumnStyle | The compiled visual Style, addressed by the element's own id. |
| `sound` | @hypit/ranking@1#RankingSoundStyle | The compiled sound Style, connected only when the board authors a sound. |

```svml
<ranking:ColumnStyle id="board-style" recipe={studio.ranking.board} font={ui-font}/>
```

The element is empty; it accepts no children and no text.

The Recipe is validated against the variant, so a Recipe holding another board's keys is refused by name.

The Recipe accepts exactly the properties listed here; every other property is refused by name.

### `<TierBoard>`

Places ordered Items into tier rows, one on each occurrence of a Moment, and publishes the board and the Tracks it renders to.

**On screen.** One rounded, bordered, shadowed board filling its Frame, with the Style's tier rows stacked down it from the top: each row is a full-width bar in that tier's own color, its short label set in a fixed-width column at the row's left edge. Items are square rounded icon tiles with no copy of their own; each lands in the row its `tier` names and packs left to right after the label column, one tile per trigger occurrence in document order. A tile written `direct` fades and rises into its cell over the appear frames; a tile written `stage` appears first inside a dashed square floating near the top of the Frame, holds there at stage size, then shrinks and travels into its cell. Every tile already placed stays exactly where it landed while the later ones arrive.

**Preview.** `preview/TierBoard.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this board so its Schedule, Program and Tracks can be referenced elsewhere in the Source. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | yes | Chooses the measured SemanticMap that gives every trigger its frame. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Chooses the ProgramSpace the board is timed and rendered against. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame the whole board occupies. |
| `during` | reference (@hypit/narrative@1#NarrativeSelection) | yes | Chooses the Selection the board is on screen for. |
| `triggers` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment whose occurrences place one TierItem each, in document order. |
| `terminal` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment the board settles on and ends after. |
| `style` | reference (@hypit/ranking@1#TierBoardStyle) | yes | Chooses the TierBoardStyle this board is drawn in, and only that variant's. |
| `appear-sound` | reference (@hypit/media@1#SynchronizedMedia) | no | Chooses the Synchronized Medium played as each Item appears. |
| `move-sound` | reference (@hypit/media@1#SynchronizedMedia) | no | Chooses the Synchronized Medium played as a staged Item moves into its row. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<TierItem>` | many | One Item of the board, placed at its own trigger occurrence in document order; it is empty. |

`<TierItem>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this Item within the board; an omitted id is generated from the Item's position. |
| `tier` | literal | yes | Chooses the row of the Style Recipe this Item is placed into. |
| `entry` | literal (direct, stage) | no | Decides whether the Item lands in its row directly or stages first and moves in, and defaults to direct. |
| `icon` | reference (@hypit/artifact@1#BlobArtifact) | yes | Chooses the image drawn beside the Item. |
| `stack` | literal | no | Overrides the Style's draw order for this Item alone. |

| Port | Type | Meaning |
|---|---|---|
| `schedule` | @hypit/ranking@1#RankingSchedule | The resolved Schedule: each Item's trigger frame and its staged, cumulative and settled spans. |
| `program` | @hypit/ranking@1#TierBoardProgram | The resolved board: its Frame, Style, Schedule and ordered Items. |
| `visual` | @hypit/composition@1#VisualTrack | The rendered board, an ordinary peer VisualTrack. |
| `audio` | @hypit/composition@1#AudioTrack | The rendered board sound, published only when a sound is authored. |

```svml
<ranking:TierBoardStyle id="tier-style" recipe={studio.ranking.tier} font={ui-font}/>
<ranking:TierBoard id="tiers" map={timing.map} space={speech.space} frame={board-frame}
  during={story.selection.board} triggers={story.moment.place} terminal={story.moment.done}
  style={tier-style}>
  <ranking:TierItem id="row-regen" tier="s" icon={icon-regen}/>
  <ranking:TierItem id="row-remini" tier="a" entry="stage" icon={icon-remini}/>
</ranking:TierBoard>
```

The board requires at least one TierItem, accepts no other child and no text of its own, and Item ids must be unique within it.

`move-sound` requires at least one TierItem written `entry="stage"`; a sound with nothing to sound on is refused.

Authoring either sound also connects the Style's `.sound` output, so `style` must name a TierBoardStyle written in this Source.

### `<TierBoardStyle>`

Compiles one SVS Recipe and one exact font into the Style a TierBoard is drawn in, and the private sound Style it connects.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Style so a TierBoard can reference it. |
| `recipe` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe carrying the tier rows, board Paint, row and cell geometry, icon treatment, staging pose and motion. |
| `font` | reference (@hypit/media@1#FontArtifactRef, @hypit/media@1#FontStackRef) | yes | Chooses the exact face, or a whole stack that already carries its own fallbacks, the board copy is set in. |

`recipe` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `rows` | no | `s:S:#ef4444|a:A:#f59e0b|b:B:#22c55e|c:C:#3b82f6` | Defines the tier rows the board draws, each written `id:label:color` and separated by `|`. |
| `font-size` | no | `28` | Sets the size in pixels the Item copy is set at. |
| `font-weight` | no | `700` | Sets the weight the Item copy is set at. |
| `text-color` | no | `#ffffff` | Sets the color the Item copy is drawn in. |
| `line-height` | no | `1.15` | Sets the line height the Item copy is set on, as a multiple of its size. |
| `board-background` | no | `#151821` | Sets the color the board fills with. |
| `board-border-color` | no | `#ffffff33` | Sets the color of the board's border. |
| `board-border-width` | no | `1` | Sets the width in pixels of the board's border. |
| `board-radius` | no | `18` | Sets the corner radius in pixels of the board. |
| `board-shadow-x` | no | `0` | Offsets the board's shadow horizontally in pixels. |
| `board-shadow-y` | no | `10` | Offsets the board's shadow vertically in pixels. |
| `board-shadow-blur` | no | `24` | Sets the blur radius in pixels of the board's shadow. |
| `board-shadow-spread` | no | `0` | Sets the spread in pixels of the board's shadow. |
| `board-shadow-color` | no | `#00000066` | Sets the color of the board's shadow. |
| `appear-frames` | no | `6` | Sets how many frames an Item takes to appear. |
| `move-frames` | no | `8` | Sets how many frames a staged Item takes to move into its row. |
| `motion-easing` | no | `ease-in-out` | Selects the easing both the appearance and the move are timed with. One of linear, ease-in, ease-out, ease-in-out. |
| `label-width` | no | `72` | Sets the width in pixels of the column the row labels are set in. |
| `padding` | no | `18` | Sets the inset in pixels between the board's edge and its rows. |
| `row-height` | no | `92` | Sets the height in pixels of one tier row. |
| `row-gap` | no | `10` | Sets the gap in pixels between tier rows. |
| `cell-gap` | no | `12` | Sets the gap in pixels between the Items within one row. |
| `icon-size` | no | `72` | Sets the size in pixels an Item's icon is drawn at. |
| `icon-radius` | no | `12` | Sets the corner radius in pixels of an Item's icon. |
| `icon-fit` | no | `cover` | Decides whether an Item's icon fits inside its box or fills it. One of contain, cover. |
| `stage-x` | no | `0.5` | Places the staging point horizontally, as a fraction of the Frame's width. |
| `stage-y` | no | `0.23` | Places the staging point vertically, as a fraction of the Frame's height. |
| `stage-size` | no | `108` | Sets the size in pixels a staged Item is drawn at before it moves in. |
| `board-stack` | no | `20` | Sets the draw order the board itself is placed at. |
| `stage-stack` | no | `25` | Sets the draw order the staging area is placed at. |
| `item-stack` | no | `30` | Sets the draw order every Item is placed at, unless the Item overrides it. |
| `appear-gain` | no | `1` | Sets the gain the appear sound is played at. |
| `move-gain` | no | `1` | Sets the gain the move sound is played at. |
| `sound-fade-frames` | no | `0` | Sets how many frames each sound fades in and out over. |

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/ranking@1#TierBoardStyle | The compiled visual Style, addressed by the element's own id. |
| `sound` | @hypit/ranking@1#RankingSoundStyle | The compiled sound Style, connected only when the board authors a sound. |

```svml
<ranking:TierBoardStyle id="tier-style" recipe={studio.ranking.tier} font={ui-font}/>
```

The element is empty; it accepts no children and no text.

The Recipe is validated against the variant, so a Recipe holding another board's keys is refused by name.

The Recipe accepts exactly the properties listed here; every other property is refused by name.

Tier row ids, labels and colors are Recipe configuration, because they define the board vocabulary rather than item copy.

### `<TopThree>`

Fills a podium one slot at a time, one on each occurrence of a Moment, and publishes the board and the Tracks it renders to.

**On screen.** No board, no fill and no shadow: at most three empty rings — circles at the Style's default corner radius — sit side by side in one row, centered on the Style's center point and standing on a shared baseline across the Frame, each outlined faintly in its own slot color. As its trigger occurs, a slot fades and rises into place, its ring brightening to the full slot color and swelling once slightly larger before settling back; the Item's icon fills the ring, or its rank number is set inside the ring in the slot color when no icon is written. The Item's label appears centered on its own line directly beneath the ring. Slots fill in document order and never move afterwards, so the row only gains brightness and copy as it goes.

**Preview.** `preview/TopThree.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this board so its Schedule, Program and Tracks can be referenced elsewhere in the Source. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | yes | Chooses the measured SemanticMap that gives every trigger its frame. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Chooses the ProgramSpace the board is timed and rendered against. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame the whole board occupies. |
| `during` | reference (@hypit/narrative@1#NarrativeSelection) | yes | Chooses the Selection the board is on screen for. |
| `triggers` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment whose occurrences place one TopThreeItem each, in document order. |
| `terminal` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment the board settles on and ends after. |
| `style` | reference (@hypit/ranking@1#TopThreeStyle) | yes | Chooses the TopThreeStyle this board is drawn in, and only that variant's. |
| `appear-sound` | reference (@hypit/media@1#SynchronizedMedia) | no | Chooses the Synchronized Medium played as each slot appears. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<TopThreeItem>` | many | One slot of the podium, placed at its own trigger occurrence in document order; it is empty. |

`<TopThreeItem>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this slot within the board; an omitted id is generated from the slot's position. |
| `label` | expression (@hypit/text@1#Text) | yes | Sets the slot's copy, written literally or chosen from an existing Text. |
| `icon` | reference (@hypit/artifact@1#BlobArtifact) | no | Chooses the image drawn beside the slot. |
| `stack` | literal | no | Overrides the Style's draw order for this slot alone. |

| Port | Type | Meaning |
|---|---|---|
| `schedule` | @hypit/ranking@1#RankingSchedule | The resolved Schedule: each Item's trigger frame and its staged, cumulative and settled spans. |
| `program` | @hypit/ranking@1#TopThreeProgram | The resolved board: its Frame, Style, Schedule and ordered Items. |
| `visual` | @hypit/composition@1#VisualTrack | The rendered board, an ordinary peer VisualTrack. |
| `audio` | @hypit/composition@1#AudioTrack | The rendered board sound, published only when a sound is authored. |

```svml
<ranking:TopThreeStyle id="podium-style" recipe={studio.ranking.podium} font={ui-font}/>
<ranking:TopThree id="podium" map={timing.map} space={speech.space} frame={board-frame}
  during={story.selection.board} triggers={story.moment.place} terminal={story.moment.done}
  style={podium-style}>
  <ranking:TopThreeItem id="slot-gold" label="ReGen" icon={icon-regen}/>
  <ranking:TopThreeItem id="slot-silver" label="ChatGPT"/>
  <ranking:TopThreeItem id="slot-bronze" label="Remini"/>
</ranking:TopThree>
```

The board requires at least one TopThreeItem, accepts no other child and no text of its own, and Item ids must be unique within it.

A `label` written as a reference materializes the slot from that exact Text before the board is scheduled.

The podium has no move phase, so it takes no `move-sound`; writing one is refused.

The podium holds at most three Items; a fourth is refused when the Program is built.

Authoring the appear sound also connects the Style's `.sound` output, so `style` must name a TopThreeStyle written in this Source.

### `<TopThreeStyle>`

Compiles one SVS Recipe and one exact font into the Style a TopThree is drawn in, and the private sound Style it connects.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Style so a TopThree can reference it. |
| `recipe` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe carrying the slot colors, podium geometry, ring and label spacing, board Paint and motion. |
| `font` | reference (@hypit/media@1#FontArtifactRef, @hypit/media@1#FontStackRef) | yes | Chooses the exact face, or a whole stack that already carries its own fallbacks, the board copy is set in. |

`recipe` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `slot-colors` | no | `#facc15|#d1d5db|#fb923c` | Defines the color each podium slot is drawn in, separated by `|`, and at least three are required. |
| `font-size` | no | `28` | Sets the size in pixels the slot copy is set at. |
| `font-weight` | no | `700` | Sets the weight the slot copy is set at. |
| `text-color` | no | `#ffffff` | Sets the color the slot copy is drawn in, before the slot's own color replaces it. |
| `line-height` | no | `1.15` | Sets the line height the slot copy is set on, as a multiple of its size. |
| `center-x` | no | `0.5` | Places the podium's center horizontally, as a fraction of the Frame's width. |
| `baseline-y` | no | `0.55` | Places the podium's baseline vertically, as a fraction of the Frame's height. |
| `slot-gap` | no | `24` | Sets the gap in pixels between podium slots. |
| `icon-size` | no | `104` | Sets the size in pixels a slot's icon is drawn at. |
| `icon-radius` | no | `52` | Sets the corner radius in pixels of a slot's icon. |
| `icon-fit` | no | `cover` | Decides whether a slot's icon fits inside its box or fills it. One of contain, cover. |
| `ring-width` | no | `5` | Sets the width in pixels of the ring drawn around a slot. |
| `label-gap` | no | `12` | Sets the gap in pixels between a slot's icon and its label. |
| `appear-frames` | no | `6` | Sets how many frames a slot takes to appear. |
| `move-frames` | no | `8` | Sets how many frames a move is timed over, though a podium never moves a slot. |
| `motion-easing` | no | `ease-in-out` | Selects the easing the appearance is timed with. One of linear, ease-in, ease-out, ease-in-out. |
| `board-stack` | no | `20` | Sets the draw order the empty podium is placed at. |
| `item-stack` | no | `30` | Sets the draw order every filled slot is placed at, unless the Item overrides it. |
| `appear-gain` | no | `1` | Sets the gain the appear sound is played at. |
| `move-gain` | no | `1` | Sets the gain a move sound would be played at, though a podium authors none. |
| `sound-fade-frames` | no | `0` | Sets how many frames each sound fades in and out over. |

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/ranking@1#TopThreeStyle | The compiled visual Style, addressed by the element's own id. |
| `sound` | @hypit/ranking@1#RankingSoundStyle | The compiled sound Style, connected only when the board authors a sound. |

```svml
<ranking:TopThreeStyle id="podium-style" recipe={studio.ranking.podium} font={ui-font}/>
```

The element is empty; it accepts no children and no text.

The Recipe is validated against the variant, so a Recipe holding another board's keys is refused by name.

The Recipe carries one color per podium slot, so a TopThree Style always resolves three of them.

Every other property is refused by name, except the board Paint and `stage-stack` keys, which a podium accepts and never reads.

### `<TypewriterList>`

Types a titled list one line at a time, one on each occurrence of a Moment, and publishes the board and the Tracks it renders to.

**On screen.** One sheet of paper filling its Frame and tilted a degree or so off square, with rounded corners, a thin border and a soft drop shadow; the title stands left-aligned across its top, and a faint hairline rule is drawn under every line the list will hold, so the empty sheet already shows how many lines are coming. Lines type themselves onto those rules from the top down, one line per trigger occurrence in document order, a grapheme at a time fading in from the left. A run marked for emphasis inside a line types in the emphasis color instead of the line color, and a line marked as the winner grows a star at the right end of its rule, scaling up from nothing once that line has finished typing. Typed lines stay on the paper, unmoved, while the ones below them are written.

**Preview.** `preview/TypewriterList.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this board so its Schedule, Program and Tracks can be referenced elsewhere in the Source. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | yes | Chooses the measured SemanticMap that gives every trigger its frame. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Chooses the ProgramSpace the board is timed and rendered against. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame the whole board occupies. |
| `during` | reference (@hypit/narrative@1#NarrativeSelection) | yes | Chooses the Selection the board is on screen for. |
| `triggers` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment whose occurrences type one TypewriterItem each, in document order. |
| `terminal` | reference (@hypit/narrative@1#NarrativeMoment) | yes | Chooses the Moment the board settles on and ends after. |
| `style` | reference (@hypit/ranking@1#TypewriterListStyle) | yes | Chooses the TypewriterListStyle this board is drawn in, and only that variant's. |
| `title` | expression (@hypit/text@1#Text) | yes | Sets the heading standing above the list, written literally or chosen from an existing Text. |
| `appear-sound` | reference (@hypit/media@1#SynchronizedMedia) | no | Chooses the Synchronized Medium played as each line is typed. |
| `move-sound` | reference (@hypit/media@1#SynchronizedMedia) | no | Chooses the Synchronized Medium played as the winner line is marked. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<TypewriterItem>` | many | One line of the list, typed at its own trigger occurrence in document order. |

`<TypewriterItem>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this line within the board; an omitted id is generated from the line's position. |
| `text` | expression (@hypit/text@1#Text) | no | Sets the line's copy, written literally or chosen from an existing Text. |
| `winner` | literal (true, false) | no | Decides whether the line is marked as the winner once it is typed, and defaults to false. |
| `emphasis-start` | literal | no | Sets the first grapheme of the emphasized run in the line's copy. |
| `emphasis-end` | literal | no | Sets the grapheme the emphasized run stops before. |
| `stack` | literal | no | Overrides the Style's draw order for this line alone. |

The line's copy, read only when `text` is absent.

| Port | Type | Meaning |
|---|---|---|
| `schedule` | @hypit/ranking@1#RankingSchedule | The resolved Schedule: each Item's trigger frame and its staged, cumulative and settled spans. |
| `program` | @hypit/ranking@1#TypewriterListProgram | The resolved board: its title, Frame, Style, Schedule and ordered Items. |
| `visual` | @hypit/composition@1#VisualTrack | The rendered board, an ordinary peer VisualTrack. |
| `audio` | @hypit/composition@1#AudioTrack | The rendered board sound, published only when a sound is authored. |

```svml
<ranking:TypewriterListStyle id="list-style" recipe={studio.ranking.list} font={ui-font}/>
<ranking:TypewriterList id="list" map={timing.map} space={speech.space} frame={board-frame}
  during={story.selection.board} triggers={story.moment.place} terminal={story.moment.done}
  style={list-style} title="What survived">
  <ranking:TypewriterItem id="line-one" text="Deterministic timing"/>
  <ranking:TypewriterItem id="line-two" text="No hidden runtime choice" winner="true"
    emphasis-start="3" emphasis-end="9"/>
</ranking:TypewriterList>
```

The board requires at least one TypewriterItem, accepts no other child and no text of its own, and Item ids must be unique within it.

A TypewriterItem takes its copy from `text` or from its own element text; writing both is refused.

`emphasis-start` and `emphasis-end` are written together or not at all, and the run they mark must be non-empty and inside the line's copy.

`move-sound` requires at least one TypewriterItem written `winner="true"`; a sound with nothing to sound on is refused.

Authoring either sound also connects the Style's `.sound` output, so `style` must name a TypewriterListStyle written in this Source.

### `<TypewriterListStyle>`

Compiles one SVS Recipe and one exact font into the Style a TypewriterList is drawn in, and the private sound Style it connects.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Style so a TypewriterList can reference it. |
| `recipe` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe carrying the title and item type, the emphasis and winner colors, the typing rate, board Paint and motion. |
| `font` | reference (@hypit/media@1#FontArtifactRef, @hypit/media@1#FontStackRef) | yes | Chooses the exact face, or a whole stack that already carries its own fallbacks, the board copy is set in. |

`recipe` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `title-font-size` | no | `34` | Sets the size in pixels the title is set at. |
| `title-font-weight` | no | `800` | Sets the weight the title is set at. |
| `title-color` | no | `#111827` | Sets the color the title is drawn in. |
| `title-line-height` | no | `1.1` | Sets the line height the title is set on, as a multiple of its size. |
| `item-font-size` | no | `26` | Sets the size in pixels an Item's line is set at. |
| `item-font-weight` | no | `600` | Sets the weight an Item's line is set at. |
| `item-color` | no | `#1f2937` | Sets the color an Item's line is drawn in. |
| `item-line-height` | no | `1.2` | Sets the line height an Item's line is set on, as a multiple of its size. |
| `emphasis-color` | no | `#dc2626` | Sets the color the emphasized span of an Item is drawn in. |
| `winner-color` | no | `#eab308` | Sets the color a winning Item is drawn in. |
| `board-background` | no | `#151821` | Sets the color the paper fills with. |
| `board-border-color` | no | `#ffffff33` | Sets the color of the paper's border. |
| `board-border-width` | no | `1` | Sets the width in pixels of the paper's border. |
| `board-radius` | no | `18` | Sets the corner radius in pixels of the paper. |
| `board-shadow-x` | no | `0` | Offsets the paper's shadow horizontally in pixels. |
| `board-shadow-y` | no | `10` | Offsets the paper's shadow vertically in pixels. |
| `board-shadow-blur` | no | `24` | Sets the blur radius in pixels of the paper's shadow. |
| `board-shadow-spread` | no | `0` | Sets the spread in pixels of the paper's shadow. |
| `board-shadow-color` | no | `#00000066` | Sets the color of the paper's shadow. |
| `padding` | no | `28` | Sets the inset in pixels between the paper's edge and its lines. |
| `row-gap` | no | `16` | Sets the gap in pixels between Item lines. |
| `title-gap` | no | `22` | Sets the gap in pixels between the title and the first Item line. |
| `rotation` | no | `-1.2` | Tilts the whole paper by this many degrees. |
| `frames-per-grapheme` | no | `2` | Sets how many frames each grapheme of an Item takes to type. |
| `winner-frames` | no | `5` | Sets how many frames a winning Item's flourish runs for after it finishes typing. |
| `board-stack` | no | `20` | Sets the draw order the paper itself is placed at. |
| `item-stack` | no | `30` | Sets the draw order every Item line is placed at, unless the Item overrides it. |
| `appear-gain` | no | `1` | Sets the gain the appear sound is played at. |
| `move-gain` | no | `1` | Sets the gain the winner sound is played at. |
| `sound-fade-frames` | no | `0` | Sets how many frames each sound fades in and out over. |

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/ranking@1#TypewriterListStyle | The compiled visual Style, addressed by the element's own id. |
| `sound` | @hypit/ranking@1#RankingSoundStyle | The compiled sound Style, connected only when the board authors a sound. |

```svml
<ranking:TypewriterListStyle id="list-style" recipe={studio.ranking.list} font={ui-font}/>
```

The element is empty; it accepts no children and no text.

The Recipe is validated against the variant, so a Recipe holding another board's keys is refused by name.

Every other property is refused by name, except the unprefixed type, motion and `stage-stack` keys, which a list accepts and never reads.

## `@hypit/render-hyperframes@1`

### `<Video>`

Renders one Composition on one ProgramSpace into a final video, publishing the muxed result as a BlobArtifact.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the render component and the final video this element publishes. |
| `composition` | reference (@hypit/composition@1#Composition) | yes | Selects the Composition this element compiles, renders and muxes. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Selects the ProgramSpace whose duration and frame rate every rendered Product is bound to. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The final muxed video Artifact, addressed as `<id>.video`. |

```svml
<render:Video id="final" composition={main.composition} space={speech.space}/>
```

All three attributes are required; the element accepts no children and no text content.

The visual render, the audio render and the mux are three separate Needs, each realized by a Provider this package does not choose.

The published Artifact carries no duration or lineage metadata, so a consumer that needs stream facts requests explicit media inspection.

## `@hypit/screen-overlay@1`

### `<Track>`

Paints self-contained screen treatments across the whole Canvas and publishes the overlay Program and the VisualTrack it renders to.

**On screen.** Treatments laid edge to edge over the whole Canvas, never a panel, a card or text, each item covering the frame for its own span only and painted over its siblings in `z` order. Flash pulses one color up to full and back down across the frame, ColorWash holds that same flat color still, and Vignette leaves the middle clear and darkens outwards to one color in an ellipse around a chosen centre. Four items cross the frame as travelling geometry: ScanLines rule it with evenly spaced white stripes at an angle, DirectionalMatte sweeps a feathered wall of color over it, WhipVeil slides a single soft-edged white band left, right, up or down, and LightLeak drags a heavily blurred angled gradient of colors from one side to the other. The remaining four scatter many small shapes from a seed: GlitchVeil throws wide colored horizontal bars that jump sideways, Grain sprinkles fine specks that crawl diagonally, Bokeh floats blurred round discs of one color that drift apart, and TVStatic fills the frame with grey noise cells beneath fine horizontal scan lines.

**Preview.** `preview/Track.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this overlay so its Program and Track can be referenced elsewhere in the Source. |
| `canvas` | reference (@hypit/spatial@1#CanvasSpace) | yes | Chooses the Canvas every item is painted across. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Chooses the ProgramSpace the overlay is timed against. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Flash>` | many | A full-Canvas flash of one color with its own attack, hold and decay in frames. |
| `<ColorWash>` | many | One flat color held over the whole Canvas at a fixed opacity. |
| `<Vignette>` | many | An elliptical falloff of one color around a normalized centre. |
| `<ScanLines>` | many | Repeating lines at a fixed spacing, thickness and angle, travelling across the Canvas. |
| `<DirectionalMatte>` | many | A feathered matte of one color crossing the Canvas at an angle over an explicit progress range. |
| `<WhipVeil>` | many | A soft band that travels across the Canvas in one of four directions. |
| `<GlitchVeil>` | many | Colored bars laid across the Canvas and displaced from an explicit seed. |
| `<Grain>` | many | Grain at a chosen amount, size and chroma, moving from an explicit seed. |
| `<LightLeak>` | many | Colored light angled across the Canvas and moving from an explicit seed. |
| `<Bokeh>` | many | Out-of-focus highlights between a minimum and maximum size, drifting from an explicit seed. |
| `<TVStatic>` | many | Broadcast noise with its own scan-line opacity, moving from an explicit seed. |

`<Flash>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `color` | literal | yes | Sets the hexadecimal color the Canvas flashes. |
| `intensity` | literal | yes | Sets how strong the flash is, from 0 to 1. |
| `attack` | literal | yes | Sets how many frames the flash takes to reach full intensity. |
| `hold` | literal | yes | Sets how many frames the flash stays at full intensity. |
| `decay` | literal | yes | Sets how many frames the flash takes to fade away. |

`<ColorWash>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `color` | literal | yes | Sets the hexadecimal color held over the Canvas. |
| `opacity` | literal | yes | Sets how opaque the wash is, from 0 to 1. |

`<Vignette>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `center-x` | literal | yes | Sets the horizontal centre of the falloff as a fraction of the Canvas width. |
| `center-y` | literal | yes | Sets the vertical centre of the falloff as a fraction of the Canvas height. |
| `radius-x` | literal | yes | Sets the horizontal radius of the falloff as a fraction of the Canvas width. |
| `radius-y` | literal | yes | Sets the vertical radius of the falloff as a fraction of the Canvas height. |
| `softness` | literal | yes | Sets how gradually the falloff fades outwards, from 0 to 1. |
| `color` | literal | yes | Sets the hexadecimal color the edges are darkened with. |
| `opacity` | literal | yes | Sets how opaque the vignette is, from 0 to 1. |

`<ScanLines>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `spacing` | literal | yes | Sets how many pixels apart the lines are. |
| `thickness` | literal | yes | Sets how many pixels thick each line is, at most the spacing. |
| `angle` | literal | yes | Sets the angle in degrees the lines run at. |
| `opacity` | literal | yes | Sets how opaque the lines are, from 0 to 1. |
| `travel` | literal | yes | Sets how many pixels the lines travel across the item's span. |

`<DirectionalMatte>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `angle` | literal | yes | Sets the angle in degrees the matte edge crosses the Canvas at. |
| `coverage` | literal | yes | Sets how much of the Canvas the matte covers, from 0 to 1. |
| `feather` | literal | yes | Sets how soft the matte edge is, from 0 to 1. |
| `color` | literal | yes | Sets the hexadecimal color the matte is filled with. |
| `opacity` | literal | yes | Sets how opaque the matte is, from 0 to 1. |
| `from` | literal | yes | Sets the progress the matte starts its crossing at, from -1 to 2. |
| `to` | literal | yes | Sets the progress the matte ends its crossing at, from -1 to 2. |

`<WhipVeil>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `direction` | literal (left, right, up, down) | yes | Chooses which way the band travels across the Canvas. |
| `width` | literal | yes | Sets how many pixels wide the band is. |
| `softness` | literal | yes | Sets how many pixels the band's edges are blurred over. |
| `travel` | literal | yes | Sets how many pixels the band travels across the item's span. |
| `opacity` | literal | yes | Sets how opaque the band is, from 0 to 1. |

`<GlitchVeil>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `bars` | literal | yes | Sets how many bars are laid across the Canvas, up to 256. |
| `colors` | literal | yes | Lists the hexadecimal colors the bars are drawn in, separated by commas. |
| `opacity` | literal | yes | Sets how opaque the bars are, from 0 to 1. |
| `travel` | literal | yes | Sets how many pixels the bars are displaced across the item's span. |
| `seed` | literal | yes | Sets the seed the bar placement and displacement are drawn from. |

`<Grain>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `amount` | literal | yes | Sets how much grain is laid over the Canvas, from 0 to 1. |
| `size` | literal | yes | Sets how many pixels across one grain particle is. |
| `chroma` | literal (monochrome, color) | yes | Decides whether the grain is monochrome or colored. |
| `motion-rate` | literal | yes | Sets how many pixels the grain moves each frame. |
| `seed` | literal | yes | Sets the seed the grain pattern is drawn from. |

`<LightLeak>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `colors` | literal | yes | Lists the hexadecimal colors the leak is drawn in, separated by commas. |
| `angle` | literal | yes | Sets the angle in degrees the light crosses the Canvas at. |
| `softness` | literal | yes | Sets how soft the leak's edges are, from 0 to 1. |
| `travel` | literal | yes | Sets how many pixels the leak travels across the item's span. |
| `intensity` | literal | yes | Sets how strong the leak is, from 0 to 1. |
| `seed` | literal | yes | Sets the seed the leak's placement is drawn from. |

`<Bokeh>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `amount` | literal | yes | Sets how many highlights are scattered over the Canvas, from 0 to 1. |
| `min-size` | literal | yes | Sets how many pixels across the smallest highlight is. |
| `max-size` | literal | yes | Sets how many pixels across the largest highlight is, never below `min-size`. |
| `color` | literal | yes | Sets the hexadecimal color the highlights are drawn in. |
| `warmth` | literal | yes | Sets how warm or cool the highlights are, from -1 to 1. |
| `drift` | literal | yes | Sets how many pixels the highlights drift across the item's span. |
| `seed` | literal | yes | Sets the seed the highlight placement is drawn from. |

`<TVStatic>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names this item; the overlay numbers the item after its kind when it is omitted. |
| `z` | literal | yes | Sets the stacking order this item is painted in against its siblings. |
| `during` | expression (program, @hypit/narrative@1#NarrativeSelection) | no | Holds the item across the whole programme, or across the Selection it names. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the item at the cue of the Moment it names. |
| `for` | literal | no | Sets the exact duration the item holds past the Moment cue. |
| `start` | literal | no | Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration. |
| `end` | literal | no | Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds explicit `start` and `end` timing to a Selection. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds explicit `start` and `end` timing to a Moment. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the semantic map the bound Selection or Moment is located through. |
| `occurrences` | literal (one, each) | no | Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`. |
| `amount` | literal | yes | Sets how much noise covers the Canvas, from 0 to 1. |
| `size` | literal | yes | Sets how many pixels across one noise cell is. |
| `scan-lines` | literal | yes | Sets how opaque the scan lines over the noise are, from 0 to 1. |
| `motion-rate` | literal | yes | Sets how many pixels the noise moves each frame. |
| `seed` | literal | yes | Sets the seed the noise is drawn from. |

| Port | Type | Meaning |
|---|---|---|
| `program` | @hypit/screen-overlay@1#ScreenOverlayProgram | The resolved overlay: every item with its frame span, its content and its stacking. |
| `track` | @hypit/composition@1#VisualTrack | The rendered overlay, an ordinary peer VisualTrack. |

```svml
<screen:Track id="effects" space={speech.space} canvas={vertical}>
  <screen:Flash during={story.selection.overlay} map={timing.map} z="80"
    color="#ffffff" intensity="0.6" attack="2" hold="2" decay="6"/>
</screen:Track>
```

The overlay requires at least one component child, and a component child is empty.

A component child writes exactly one temporal form, `during`, `at`, or `start` with `end`; none of them or more than one is refused.

`during` takes the literal `program` for the whole programme, or a Selection reference, which also requires `map`.

`at` requires `map` and `for`.

`start` and `end` each take `program.start`, `program.end`, `selection.start`, `selection.end` or `moment.cue` with an optional `+` or `-` offset, or a bare duration read as an absolute point.

Explicit `start` and `end` timing binds a Selection through `selection` or a Moment through `moment`, never both, and either one requires `map`; `map` without a temporal source is refused.

A duration is written as an integral `f` or `ms` count, or as an `s` count that may carry a decimal fraction.

## `@hypit/script@1`

### `<script>`

Holds every spoken word as prose-first Segments and publishes the authored Narrative with the Selections, Moments and text projections the rest of the source reads.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | no | Names the Narrative Record and prefixes every view this element publishes. |

The element's own content is the Script body: named Segments holding prose, Role Cues, Dual Text, and zero-width Selection and Moment markers. It carries no timecode, no media reference and no generation parameter.

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/narrative@1#Narrative | The whole authored Narrative, addressed by the element's own id. |
| `segment.<id>` | @hypit/narrative@1#NarrativeExcerpt | One Segment as a narrow Excerpt, used to associate a generated Take with that Segment. |
| `segment.<id>.dialogue` | @hypit/text@1#Text | One Segment as display-independent dialogue, keeping Role Cue labels and the spoken side of Dual Text. |
| `segment.<id>.speech` | @hypit/text@1#Text | One Segment as pronunciation only, with Role Cue labels dropped. |
| `caption` | @hypit/narrative@1#CaptionDisplaySequence | The ordered display Atoms of the whole Script. |
| `caption.correspondence` | @hypit/narrative@1#CaptionCorrespondence | The edge from each whole display Atom to its authored speech-token range. |
| `caption.selection.<id>` | @hypit/narrative@1#CaptionDisplayWordSubset | The display words wholly owned by one Selection. |
| `selection.<id>` | @hypit/narrative@1#NarrativeSelection | One named range over the Narrative, reusable wherever a Selection is read. |
| `moment.<id>` | @hypit/narrative@1#NarrativeMoment | One named point in the Narrative, reusable wherever a Moment is read. |

```svml
<script id="story">
  @whole
  <hook>
    <HOST> @problem Never let anyone take credit for your work. @/problem
  </hook>

  <meeting>
    <HOST> I started sending <BCC | B C C> recaps. @ranking! Everything changed.
  </meeting>
  @/whole~
</script>
```

`id` defaults to `script` and must be a canonical lower-case identifier of up to 64 characters.

A Script requires at least one Segment, and natural-language text is refused outside a Segment.

A Segment is opened by its own lower-case name and closed by that exact name, or written self-closing as `<pause/>`; the name is the Segment id, must be unique within the Script, and `script` is reserved. Segments do not nest.

A Role Cue such as `<HOST>` is a bare tag inside a Segment with no close; its turn runs until the next Cue or the end of the Segment, and a Cue may not follow unowned speech in the same Segment. Role state resets when the Segment closes.

Dual Text is written `<display | speech>`: the left side reaches the caption projection and the right side reaches dialogue and speech. The spoken side must not be empty; the displayed side may be, which speaks a word that is never displayed.

Selection and Moment markers are zero-width, share one name namespace, and may not split a speech token:

| Marker | Meaning |
|---|---|
| `@id` | Opens a Selection at the next word's start |
| `~@id` | Opens a Selection at the previous word's end |
| `@/id` | Closes a Selection at the previous word's end |
| `@/id~` | Closes a Selection at the next word's start |
| `@id!` | A Moment at the next word's start |
| `~@id!` | A Moment at the previous word's end |

One Selection name may open and close more than once, giving a Selection with gaps, and two Selections may cross each other rather than nest.

`<!-- -->` comments never enter any projection, and `\@`, `\<` and `\\` write those characters literally; inside Dual Text `\|` and `\>` do the same.

## `@hypit/seedance@1`

### `<FrameVideo>`

Generates one video with an exact Seedance model from a Text prompt and the images the video opens and closes on.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the binding it publishes. |
| `model` | literal (standard, seedance-2, fast, seedance-2-fast, mini, seedance-2-mini, 2.5, seedance-2.5) | yes | Chooses the exact Seedance variant that renders the video. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the video the model renders. |
| `duration` | expression (@hypit/speech@1#SpeechDuration) | yes | Sets the length of the video in seconds, either written literally or taken from a SpeechDuration edge. |
| `resolution` | literal (480p, 720p, 1080p, 4k) | no | Chooses the size band the model renders at. |
| `aspect-ratio` | literal (1:1, 4:3, 3:4, 16:9, 9:16, 21:9, adaptive) | no | Chooses the shape of the generated video. |
| `generate-audio` | literal (true, false) | no | Decides whether the model generates audio alongside the picture. |
| `first-frame` | reference (@hypit/artifact@1#BlobArtifact) | yes | The image Artifact the generated video opens on. |
| `last-frame` | reference (@hypit/artifact@1#BlobArtifact) | no | The image Artifact the generated video closes on. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The first ordered member of the generated set, addressed as `<id>.video`. |

```svml
<seedance:FrameVideo id="bridge" model="fast" prompt={direction} duration="5" first-frame={first.image} last-frame={last.image}/>
```

`resolution` defaults to `720p`, `aspect-ratio` to `9:16` and `generate-audio` to `false`.

`1080p` and `4k` are offered by `standard` alone; the other variants render at `480p` or `720p`.

`duration` is 4 to 15 seconds for `standard`, `fast` and `mini`, and `-1` for automatic or 4 to 30 seconds for `2.5`.

Both frames are ordinary image Artifact edges; the Surface copies no runtime media into request metadata.

The element accepts no children and no text content.

### `<ReferenceVideo>`

Generates one video with an exact Seedance model from a Text prompt and one or more image, video or audio references.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the binding it publishes. |
| `model` | literal (standard, seedance-2, fast, seedance-2-fast, mini, seedance-2-mini, 2.5, seedance-2.5) | yes | Chooses the exact Seedance variant that renders the video. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the video the model renders. |
| `duration` | expression (@hypit/speech@1#SpeechDuration) | yes | Sets the length of the video in seconds, either written literally or taken from a SpeechDuration edge. |
| `resolution` | literal (480p, 720p, 1080p, 4k) | no | Chooses the size band the model renders at. |
| `aspect-ratio` | literal (1:1, 4:3, 3:4, 16:9, 9:16, 21:9, adaptive) | no | Chooses the shape of the generated video. |
| `generate-audio` | literal (true, false) | no | Decides whether the model generates audio alongside the picture. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one Artifact as a reference through exactly one of its `image`, `video` or `audio` references. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | no | The image Artifact this reference contributes to the generation. |
| `video` | reference (@hypit/artifact@1#BlobArtifact) | no | The video Artifact this reference contributes to the generation. |
| `audio` | reference (@hypit/artifact@1#BlobArtifact) | no | The audio Artifact this reference contributes to the generation. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The first ordered member of the generated set, addressed as `<id>.video`. |

```svml
<seedance:ReferenceVideo
  id="hook-take"
  model="mini"
  prompt={hook-prompt}
  duration={hook-duration.duration}
  resolution="720p"
  aspect-ratio="9:16"
  generate-audio="true"
>
  <seedance:Reference image={presenter-clean}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

`resolution` defaults to `720p`, `aspect-ratio` to `9:16` and `generate-audio` to `false`.

`1080p` and `4k` are offered by `standard` alone; the other variants render at `480p` or `720p`.

`duration` is 4 to 15 seconds for `standard`, `fast` and `mini`, and `-1` for automatic or 4 to 30 seconds for `2.5`.

The element requires at least one `Reference` child, and the model's port limits cap how many of each role it accepts.

A `Reference` carries exactly one of `image`, `video` or `audio`, and is empty.

### `<TextVideo>`

Generates one video with an exact Seedance model from a Text prompt alone.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the binding it publishes. |
| `model` | literal (standard, seedance-2, fast, seedance-2-fast, mini, seedance-2-mini, 2.5, seedance-2.5) | yes | Chooses the exact Seedance variant that renders the video. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the video the model renders. |
| `duration` | expression (@hypit/speech@1#SpeechDuration) | yes | Sets the length of the video in seconds, either written literally or taken from a SpeechDuration edge. |
| `resolution` | literal (480p, 720p, 1080p, 4k) | no | Chooses the size band the model renders at. |
| `aspect-ratio` | literal (1:1, 4:3, 3:4, 16:9, 9:16, 21:9, adaptive) | no | Chooses the shape of the generated video. |
| `generate-audio` | literal (true, false) | no | Decides whether the model generates audio alongside the picture. |
| `web-search` | literal (true, false) | no | Decides whether the model consults Web Search while generating. |

| Port | Type | Meaning |
|---|---|---|
| `video` | @hypit/artifact@1#BlobArtifact | The first ordered member of the generated set, addressed as `<id>.video`. |

```svml
<seedance:TextVideo id="take-hook" model="mini" prompt={direction} duration="5" generate-audio="true"/>
```

`resolution` defaults to `720p`, `aspect-ratio` to `9:16` and `generate-audio` to `false`.

`1080p` and `4k` are offered by `standard` alone; the other variants render at `480p` or `720p`.

`duration` is 4 to 15 seconds for `standard`, `fast` and `mini`, and `-1` for automatic or 4 to 30 seconds for `2.5`.

This is the only invocation shape that exposes Web Search.

The element accepts no children and no text content.

## `@hypit/seedream@1`

### `<ReferenceImage>`

Generates one picture with the exact Seedream 5 Lite model from a Text prompt and one or more reference images.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the bindings it publishes. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the picture the model renders. |
| `aspect-ratio` | literal (1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9) | yes | The shape of the generated picture. |
| `quality` | literal (basic, high, ultra) | yes | The render band the model works at, basic 2K, high 3K and ultra 4K. |
| `output-format` | literal (png, jpeg) | yes | The encoding of the returned image. |
| `nsfw-check` | literal (true, false) | yes | Whether the Provider applies its safety check to this request. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Reference>` | many | Attaches one image Artifact to the request as a reference picture. |

`<Reference>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `image` | reference (@hypit/artifact@1#BlobArtifact) | yes | The Artifact supplied as a reference picture, which must carry image media. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The primary generated image, addressed as `<id>.image`. |

```svml
<seedream:ReferenceImage
  id="variation"
  prompt={variationPrompt}
  aspect-ratio="9:16"
  quality="high"
  output-format="png"
  nsfw-check="true"
>
  <seedream:Reference image={scene.image}/>
</seedream:ReferenceImage>
```

The element requires at least one `Reference` child and accepts at most 16.

The Surface copies no runtime media into request metadata; every reference stays a graph edge.

### `<TextImage>`

Generates one picture with the exact Seedream 5 Lite model from a Text prompt alone.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this generation and prefixes the bindings it publishes. |
| `prompt` | reference (@hypit/text@1#Text) | yes | The Text edge describing the picture the model renders. |
| `aspect-ratio` | literal (1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9) | yes | The shape of the generated picture. |
| `quality` | literal (basic, high, ultra) | yes | The render band the model works at, basic 2K, high 3K and ultra 4K. |
| `output-format` | literal (png, jpeg) | yes | The encoding of the returned image. |
| `nsfw-check` | literal (true, false) | yes | Whether the Provider applies its safety check to this request. |

| Port | Type | Meaning |
|---|---|---|
| `image` | @hypit/artifact@1#BlobArtifact | The primary generated image, addressed as `<id>.image`. |

```svml
<seedream:TextImage
  id="scene"
  prompt={prompt}
  aspect-ratio="9:16"
  quality="high"
  output-format="png"
  nsfw-check="true"
/>
```

The element accepts no children; reference pictures belong to `ReferenceImage`.

Every request field is written by the author; the Runtime chooses no model on the author's behalf.

## `@hypit/spatial@1`

### `<AnchoredFrame>`

Places one Frame of a stated size by pinning one of its nine anchor points to a position in the parent.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Frame this element publishes. |
| `within` | reference (@hypit/spatial@1#CanvasSpace, @hypit/spatial@1#SpatialFrame) | yes | Chooses the Canvas or parent Frame the position and size are measured against. |
| `x` | literal | yes | Places the anchor point along the parent's width. |
| `y` | literal | yes | Places the anchor point down the parent's height. |
| `width` | literal | yes | Sizes the Frame across the parent's width. |
| `height` | literal | yes | Sizes the Frame down the parent's height. |
| `anchor` | literal (top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right) | yes | Chooses which point of the Frame lands on `x` and `y`. |
| `offset-x` | literal | no | Nudges the placed Frame this many pixels along x; defaults to `0`. |
| `offset-y` | literal | no | Nudges the placed Frame this many pixels along y; defaults to `0`. |

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/spatial@1#SpatialFrame | The resolved Frame, addressed by the element's own id. |

```svml
<space:AnchoredFrame id="card" within={safe} x="50%" y="78%" width="82%" height="28%" anchor="center"/>
```

The element is empty; it accepts no children and no text.

A length is a number followed by `px` or `%`; a percentage resolves against the parent Frame's width on the x axis and its height on the y axis.

`offset-x` and `offset-y` are finite pixel numbers, and a Frame may deliberately sit partly or wholly outside its parent.

A Canvas written in `within` is first resolved to its own full-Canvas Frame, so every Frame is placed inside a Frame.

### `<AspectFrame>`

Places one Frame that keeps a stated aspect ratio, sized on one axis and anchored in the parent.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Frame this element publishes. |
| `within` | reference (@hypit/spatial@1#CanvasSpace, @hypit/spatial@1#SpatialFrame) | yes | Chooses the Canvas or parent Frame the position and size are measured against. |
| `x` | literal | yes | Places the anchor point along the parent's width. |
| `y` | literal | yes | Places the anchor point down the parent's height. |
| `aspect` | expression (@hypit/spatial@1#IntrinsicExtent) | yes | Fixes the ratio the Frame keeps, as a referenced IntrinsicExtent or a written `width/height` ratio. |
| `anchor` | literal (top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right) | yes | Chooses which point of the Frame lands on `x` and `y`. |
| `width` | literal | no | Sizes the Frame across the parent's width and derives its height from the ratio. |
| `height` | literal | no | Sizes the Frame down the parent's height and derives its width from the ratio. |
| `offset-x` | literal | no | Nudges the placed Frame this many pixels along x; defaults to `0`. |
| `offset-y` | literal | no | Nudges the placed Frame this many pixels along y; defaults to `0`. |

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/spatial@1#SpatialFrame | The resolved Frame, addressed by the element's own id. |

```svml
<space:AspectFrame id="sticker" within={safe} x="100%" y="100%" width="32%" aspect="9/16" anchor="bottom-right"/>
```

The element is empty; it accepts no children and no text.

Exactly one of `width` or `height` is written; the other axis follows from the ratio.

A length is a number followed by `px` or `%`; a percentage resolves against the parent Frame's width on the x axis and its height on the y axis.

A written `aspect` is two positive numbers separated by `/`, such as `9/16`; a referenced `aspect` must be an IntrinsicExtent.

A Canvas written in `within` is first resolved to its own full-Canvas Frame, so every Frame is placed inside a Frame.

### `<Canvas>`

Declares one Canvas: the pixel extent every Frame is measured inside.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the CanvasSpace Record this element publishes. |
| `width` | literal | yes | States how many pixels wide the Canvas is. |
| `height` | literal | yes | States how many pixels tall the Canvas is. |

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
```

The element is empty; it accepts no children and no text.

`width` and `height` are positive whole numbers of pixels.

The coordinate system is fixed: the origin is top-left, x increases to the right, y increases downward and pixels are square.

The CanvasSpace is published under the bare `id`.

### `<Extent>`

States the intrinsic pixel extent of content, independent of the Frame it is placed in.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the IntrinsicExtent Record this element publishes. |
| `width` | literal | yes | States how many pixels wide the content is. |
| `height` | literal | yes | States how many pixels tall the content is. |

```svml
<space:Extent id="portrait" width="540" height="960"/>
```

The element is empty; it accepts no children and no text.

`width` and `height` are positive whole numbers of pixels.

The IntrinsicExtent is published under the bare `id`.

### `<Frame>`

Places one Frame by its four edges inside a Canvas or a parent Frame.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Frame this element publishes. |
| `within` | reference (@hypit/spatial@1#CanvasSpace, @hypit/spatial@1#SpatialFrame) | yes | Chooses the Canvas or parent Frame the four edges are measured against. |
| `left` | literal | yes | Places the left edge, measured from the parent's left. |
| `top` | literal | yes | Places the top edge, measured from the parent's top. |
| `right` | literal | yes | Places the right edge, measured from the parent's left. |
| `bottom` | literal | yes | Places the bottom edge, measured from the parent's top. |

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/spatial@1#SpatialFrame | The resolved Frame, addressed by the element's own id. |

```svml
<space:Frame id="safe" within={vertical} left="6%" top="4%" right="94%" bottom="96%"/>
```

The element is empty; it accepts no children and no text.

A length is a number followed by `px` or `%`; a percentage resolves against the parent Frame's width on the x axis and its height on the y axis.

`right` must resolve past `left` and `bottom` past `top`, because a Frame has positive width and height.

A Canvas written in `within` is first resolved to its own full-Canvas Frame, so every Frame is placed inside a Frame.

### `<Path>`

Draws one Path in Canvas pixels from an ordered list of commands.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the SpatialPath Record this element publishes. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Move>` | many | Lifts the pen and starts a new subpath at a point. |
| `<Line>` | many | Draws a straight segment to a point. |
| `<Quadratic>` | many | Draws a quadratic curve to a point through one control point. |
| `<Cubic>` | many | Draws a cubic curve to a point through two control points. |
| `<Close>` | many | Closes the open subpath back to where it began. |

`<Move>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `x` | literal | yes | Starts the subpath this many pixels along the Canvas x axis. |
| `y` | literal | yes | Starts the subpath this many pixels down the Canvas y axis. |

`<Line>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `x` | literal | yes | Ends the segment this many pixels along the Canvas x axis. |
| `y` | literal | yes | Ends the segment this many pixels down the Canvas y axis. |

`<Quadratic>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `control-x` | literal | yes | Places the control point this many pixels along the Canvas x axis. |
| `control-y` | literal | yes | Places the control point this many pixels down the Canvas y axis. |
| `x` | literal | yes | Ends the curve this many pixels along the Canvas x axis. |
| `y` | literal | yes | Ends the curve this many pixels down the Canvas y axis. |

`<Cubic>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `control1-x` | literal | yes | Places the control point leaving the current point this many pixels along the Canvas x axis. |
| `control1-y` | literal | yes | Places the control point leaving the current point this many pixels down the Canvas y axis. |
| `control2-x` | literal | yes | Places the control point entering the end point this many pixels along the Canvas x axis. |
| `control2-y` | literal | yes | Places the control point entering the end point this many pixels down the Canvas y axis. |
| `x` | literal | yes | Ends the curve this many pixels along the Canvas x axis. |
| `y` | literal | yes | Ends the curve this many pixels down the Canvas y axis. |

```svml
<space:Path id="headline-path">
  <space:Move x="120" y="280"/>
  <space:Cubic control1-x="360" control1-y="180" control2-x="720" control2-y="380" x="960" y="280"/>
</space:Path>
```

The Path accepts only command children and no text.

Every command is written empty, and every coordinate is a finite pixel number.

A Path begins with `<Move>`, carries at least one drawable segment, and reopens with `<Move>` after a `<Close>`.

The SpatialPath is published under the bare `id`.

### `<Point>`

Names one position on the Canvas in pixels.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the SpatialPoint Record this element publishes. |
| `x` | literal | yes | Places the Point this many pixels along the Canvas x axis. |
| `y` | literal | yes | Places the Point this many pixels down the Canvas y axis. |

```svml
<space:Point id="headline-origin" x="120" y="280"/>
```

The element is empty; it accepts no children and no text.

`x` and `y` are finite pixel numbers, so a Point may be fractional, negative or outside the Canvas.

The SpatialPoint is published under the bare `id`.

## `@hypit/speech-spine@1`

### `<Spine>`

Folds ordered speech Takes into one SpeechBasis, and publishes the ProgramSpace every other Track is timed against together with the peer VisualTrack and AudioTrack the speech renders to.

**On screen.** The speaking picture itself, and the layer every other Track is stacked over. Each Take's own footage fills the Frame the Spine names, fitted by its Recipe, and the Takes run one after another in the order they are written, so the picture cuts from one to the next at each Take boundary with nothing between them. A Take may name its own Frame, so the picture can move or resize at a boundary; otherwise the framing holds. Nothing is drawn on top: titles, captions and cutaways are separate Tracks lying above this one.

**Preview.** `preview/Spine.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Spine and prefixes the Program, the media normalization and every binding it publishes. |
| `frame-rate` | literal | yes | Fixes the frame rate every Take is normalized to and the ProgramSpace is measured in, written as a positive rational such as 30 or 30000/1001. |
| `visual-frame` | reference (@hypit/spatial@1#SpatialFrame) | yes | Chooses the Frame every visual Take occupies unless the Take names its own. |
| `visual-appearance` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe that fits every visual Take into its Frame unless the Take names its own. |
| `visual-z` | literal | yes | Sets the stacking order every visual Take is composited at unless the Take names its own. |

`visual-appearance` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `fit` | no | `contain` | Decides how the Take's picture is scaled before it is placed: `contain` and `cover` keep its aspect ratio inside or across the Frame, `fit-width` and `fit-height` match one Frame edge, `native` keeps its own pixels, `scale-down` shrinks it only when it overflows, and `stretch` takes the Frame's exact size. One of contain, cover, fit-width, fit-height, native, scale-down, stretch. |
| `frame-x` | no | `0.5` | Places the anchor point across the Frame's width, as a fraction from 0 at its left edge to 1 at its right. |
| `frame-y` | no | `0.5` | Places the anchor point down the Frame's height, as a fraction from 0 at its top edge to 1 at its bottom. |
| `content-x` | no | `0.5` | Chooses the point across the scaled picture's width that meets the Frame's anchor, as a fraction from 0 at its left edge to 1 at its right. |
| `content-y` | no | `0.5` | Chooses the point down the scaled picture's height that meets the Frame's anchor, as a fraction from 0 at its top edge to 1 at its bottom. |
| `fit-offset-x` | no | `0` | Shifts the placed picture horizontally in pixels once the two anchor points meet. |
| `fit-offset-y` | no | `0` | Shifts the placed picture vertically in pixels once the two anchor points meet. |
| `fit-constraint` | no | `bounded` | Decides whether the placed picture is pulled back until it covers as much of the Frame as its size allows, or left exactly where the anchors and offsets put it. One of bounded, free. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Take>` | many | One spoken Segment and the single source that performs it, in document order. |

`<Take>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `segment` | reference (@hypit/narrative@1#NarrativeExcerpt) | yes | Chooses the spoken Segment this Take performs. |
| `video` | reference (@hypit/artifact@1#BlobArtifact) | no | Performs the Segment from a raw video the Surface inspects, selects and normalizes before assembly. |
| `audio` | reference (@hypit/artifact@1#BlobArtifact) | no | Performs the Segment from a voice recording normalized audio-authoritatively, contributing no visual clip. |
| `media` | reference (@hypit/media@1#SynchronizedMedia) | no | Performs the Segment from an already prepared timed source, connected directly. |
| `frame` | reference (@hypit/spatial@1#SpatialFrame) | no | Chooses this Take's own Frame in place of the Spine's `visual-frame`. |
| `appearance` | reference (@hypit/svs@1#Recipe) | no | Chooses this Take's own fit Recipe in place of the Spine's `visual-appearance`. |
| `z` | literal | no | Sets this Take's own stacking order in place of the Spine's `visual-z`. |

| Port | Type | Meaning |
|---|---|---|
| `basis` | @hypit/speech@1#SpeechBasis | The assembled SpeechBasis: the ordered Takes, their placed audio and their visual clips. |
| `space` | @hypit/program-space@1#ProgramSpace | The speech coordinate space, the frame domain every other Track resolves its windows in. |
| `audio` | @hypit/speech@1#SpeechAudioBasis | The rendered speech audio, as the timed basis measurement and captioning read. |
| `visual` | @hypit/composition@1#VisualTrack | The rendered speech picture, an ordinary peer VisualTrack. |
| `audioTrack` | @hypit/composition@1#AudioTrack | The rendered speech sound, an ordinary peer AudioTrack. |

```svml
<speech:Spine id="speech" frame-rate="30"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take video={take-opening.video} segment={story.segment.opening}/>
  <speech:Take video={take-closing.video} segment={story.segment.closing}/>
</speech:Spine>
```

A Spine requires at least one Take and accepts no text content.

`visual-appearance` and a Take's `appearance` must each be an authored SVS Recipe declaring only the spatial fit properties listed for them; any other property is refused.

A Take states exactly one of `video`, `audio` or `media`; an `audio` Take is refused `frame`, `appearance` and `z`.

Placement and stacking are the complete visual authority of a Spine; motion, transitions and independent pictures remain ordinary Media Tracks.

## `@hypit/text@1`

### `<Render>`

Renders one TextTemplate against explicit bindings and publishes the result as an ordinary Text graph value.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the render, under which the rendered Text and its binding Records are published. |
| `template` | reference (@hypit/text@1#TextTemplate) | yes | Chooses the TextTemplate that is rendered. |
| `recipe` | reference (@hypit/svs@1#Recipe) | no | Chooses the Recipe whose scalar properties fill the bindings the Template declares. |

`template` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `separator` | no | `paragraph` | Decides how the root Recipe joins its blocks, which is by one blank line. One of paragraph. |
| `default-<binding>` | no | — | Fills the binding of that name from the root Recipe whenever a render supplies nothing for it. |
| `kind` | yes | — | Decides what a block Recipe contributes: literal Text, a choice keyed by one binding, a choice keyed by conditions, or a binding rendered in place. One of fixed, axis, variant, slot. |
| `order` | yes | — | Places a block among the Template's blocks as a non-negative integer no other block repeats. |
| `text` | yes | — | Carries the literal Text a `fixed` block, or one choice of an `axis` or `variant` block, contributes. |
| `parameter` | yes | — | Names the binding an `axis` block reads, whose value picks the choice carrying that id. |
| `slot` | yes | — | Names the binding a `slot` block renders in place. |
| `optional` | no | `false` | Decides whether a `slot` block is left out entirely when its binding is absent. |
| `label` | no | — | Puts one line of literal Text above the binding a `slot` block renders. |
| `when-param-<binding>` | no | — | Holds a `variant` choice back until the binding of that name equals this scalar. |
| `when-select-<binding>` | no | — | States the same condition as `when-param-`, for a binding an author reads as a Selection. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Param>` | many | Writes one scalar binding literally, in place of the Recipe property of that name. |
| `<Set>` | many | Connects one Text as a graph edge that replaces the binding of that name. |
| `<Append>` | many | Connects one Text as a graph edge that is added after the binding of that name. |

`<Param>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `name` | literal | yes | Names the binding this scalar fills. |
| `value` | literal | yes | Carries the scalar the binding takes, read as the declared type. |
| `type` | literal (text, number, boolean) | no | Chooses how `value` is read, defaulting to text. |

`<Set>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `name` | literal | yes | Names the binding this Text replaces. |
| `text` | reference (@hypit/text@1#Text) | yes | Selects the Text the binding takes. |

`<Append>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `name` | literal | yes | Names the binding this Text is added after. |
| `text` | reference (@hypit/text@1#Text) | yes | Selects the Text added after the binding. |

| Port | Type | Meaning |
|---|---|---|
| `` | @hypit/text@1#Text | The rendered Text, addressed by the element's own id. |

```svml
<text:Render id="prompt" template={ugc.product-shot} recipe={studio.product-shot}>
  <text:Param name="camera" value="handheld"/>
  <text:Param name="strict" value="true" type="boolean"/>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Append name="constraints" text={extra}/>
</text:Render>
```

Two `Param` children may not carry the same name; `Set` and `Append` children apply in the order written.

`recipe` fills only the bindings the Template declares; every other Recipe property is ignored, and a `Param` of the same name wins over it.

A TextTemplate sheet declares exactly one root Recipe `text-template.<id>`, its blocks under `<root>.block.<block>` and their choices under `<root>.choice.<block>.<choice>`; any other Recipe beneath the root is refused.

Each of those Recipes accepts exactly the properties its kind allows and refuses every other one; a `fixed` block takes `text`, an `axis` block takes `parameter`, a `variant` block takes neither, and a `slot` block takes `slot`, `optional` and `label`.

The initial bindings are sealed into a TextBindings Record published as `<id>.bindings`, and each Set or Append spec into its own TextBinding Record.

The element carries no text content of its own.

### `<Value>`

Authors one literal Text value from the element's own body.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names the Text Record this element publishes. |

The element's body is the exact Text value, with the blank lines around it and the indentation shared by every line removed.

```svml
<text:Value id="extra">Keep the product readable.</text:Value>
```

The element accepts text only; a child element is refused.

The Text is published under the bare `id`.

## `@hypit/typography-track@1`

### `<Mask>`

Cuts one owned Surface to the shape of one authored TypographyTrackProgram and publishes the result as a peer VisualTrack.

**On screen.** The words of the authored Text Program filled with a picture: each item's letterforms are cut out of the material Surface, and every pixel outside the glyphs is transparent. Only the glyph shapes carry across — the Style's own fills, outlines and boxes are not drawn — so what reads on screen is one horizontal line of type per item, set at the padding and inline and block alignment of its Frame, with the material scaled to contain, cover or fill that Frame behind it. Items appear and vanish on the same frames as the Text Program they take their shape from, and each plays that item's whole-item Motion, so the picture-filled type translates, scales, rotates, fades, blurs or wipes as one piece.

**Preview.** `preview/Mask.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Mask, under which its VisualTrack is published. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Fixes the frame domain the masked Track is rendered into. |
| `text` | reference (@hypit/typography-track@1#TypographyTrackProgram) | yes | Chooses the authored Text Program whose items give the mask its shape and timing. |
| `material` | reference (@hypit/media@1#CompositableSurfaceRef) | yes | Chooses the Surface shown through the text. |
| `mode` | literal (alpha, luminance) | no | Whether the text masks by coverage or by brightness; defaults to `alpha`. |
| `fit` | literal (contain, cover, fill) | no | How the material occupies each masked item; defaults to `cover`. |

| Port | Type | Meaning |
|---|---|---|
| `track` | @hypit/composition@1#VisualTrack | The masked picture, an ordinary peer VisualTrack. |

```svml
<text:Mask id="masked-titles" space={speech.space} text={mask-shape.program} material={material}/>
```

A Mask is written empty and accepts no children.

The material must be a still Surface; a timed material is refused and materializes through an independent package.

Every item of the Text Program must be one Area holding one unstyled paragraph, without Sequence motion, and drawn in a Style that is fixed in both axes, unwrapped, single-column, horizontally written, undecorated, without `ellipsis` or `shrink` overflow, and whose weight and style match its primary exact font without synthesis; anything else is refused.

### `<Motion>`

One named TextMotion: the keyframes an item plays as a whole, the Sequences that animate its document units, and the Path start margin over time.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Motion, under which items reference it. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<ItemKeyframe>` | many | Fixes the transform, opacity, blur, color or clip of the whole item at one frame. |
| `<Sequence>` | many | Animates a range of paragraphs, lines, runs, words or graphemes one after another. It carries its own Keyframe children. |
| `<PathKeyframe>` | many | Fixes the start margin of Path text at one frame, moving the text along its Path. |

`<ItemKeyframe>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `at` | literal | yes | Lands this keyframe on an exact frame of the item's window. |
| `easing` | literal | no | Decides how the value travels into this keyframe. |
| `x` | literal | no | Translates the item horizontally, in pixels. |
| `y` | literal | no | Translates the item vertically, in pixels. |
| `scale` | literal | no | Scales the item uniformly; defaults to `1`. |
| `rotate` | literal | no | Rotates the item, in degrees. |
| `skew-x` | literal | no | Skews the item horizontally, in degrees. |
| `skew-y` | literal | no | Skews the item vertically, in degrees. |
| `opacity` | literal | no | Sets the item's opacity at this keyframe. |
| `blur` | literal | no | Blurs the item by this radius in pixels. |
| `color` | literal | no | Sets the glyph color at this keyframe. |
| `clip-top` | literal | no | Insets the top edge of the reveal rectangle, as a percentage. |
| `clip-right` | literal | no | Insets the right edge of the reveal rectangle, as a percentage. |
| `clip-bottom` | literal | no | Insets the bottom edge of the reveal rectangle, as a percentage. |
| `clip-left` | literal | no | Insets the left edge of the reveal rectangle, as a percentage. |

`<Sequence>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Sequence inside the Motion. |
| `unit` | literal | yes | Chooses the document unit one animation instance covers. |
| `start-index` | literal | yes | Fixes the first unit index the Sequence covers. |
| `end-index` | literal | yes | Fixes the exclusive last unit index the Sequence covers. |
| `duration-frames` | literal | yes | Sets how long one unit's animation lasts. |
| `order` | literal | no | Decides the order the units animate in; defaults to `forward`. |
| `start-frame` | literal | no | Lands the first unit's animation on this frame; defaults to `0`. |
| `stagger-frames` | literal | no | Delays each unit behind the one before it; defaults to `0`. |
| `cycles` | literal | no | Repeats one unit's animation this many times; defaults to `1`. |
| `seed` | literal | no | Fixes the draw a `random` order makes. |

`<PathKeyframe>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `at` | literal | yes | Lands this keyframe on an exact frame of the item's window. |
| `margin` | literal | yes | Sets how far along the Path the text begins, in pixels. |
| `easing` | literal (linear, ease-in, ease-out, ease-in-out) | no | Decides how the margin travels into this keyframe. |

```svml
<text:Motion id="arrive">
  <text:ItemKeyframe at="0" y="24" opacity="0"/>
  <text:ItemKeyframe at="150" y="0" opacity="1"/>
  <text:Sequence id="words" unit="word" start-index="0" end-index="2" duration-frames="12" stagger-frames="3">
    <text:Keyframe at="0" opacity="0"/>
    <text:Keyframe at="1" opacity="1"/>
  </text:Sequence>
</text:Motion>
```

An `<ItemKeyframe>` is written empty, and it and a `<Keyframe>` alike must animate at least one of `x`, `y`, `scale`, `rotate`, `skew-x`, `skew-y`, `opacity`, `blur`, `color` or a `clip-` inset.

An item animation and a Path margin animation each need at least two keyframes.

A `<Sequence>` accepts only `<Keyframe>` children and carries at least two of them; a `<Keyframe>` takes the same attributes as an `<ItemKeyframe>`, with `at` read as the progress from 0 to 1 through one unit.

The TextMotion Record is published under the bare `id`, and the element carries no text content.

### `<Style>`

One named TextStyle: the typography and layout properties of an SVS Recipe, the exact font bytes text is shaped with, and the ordered Paint the glyphs are drawn in.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Style, under which items and Spans reference it. |
| `recipe` | reference (@hypit/svs@1#Recipe) | yes | Chooses the Recipe that states the typography, area, point and path properties of this Style. |
| `font` | reference (@hypit/media@1#FontArtifactRef, @hypit/media@1#FontStackRef) | yes | Chooses the exact font bytes text is shaped with, either one face or one ordered stack of faces. |

`recipe` Recipe properties:

| Property | Required | Default | Meaning |
|---|---|---|---|
| `stack-order` | yes | — | Fixes where the text drawn in this Style sits in the Track's paint order. |
| `size` | yes | — | Sets the type size in pixels, which must be positive. |
| `weight` | no | `400` | Sets the font weight, as a whole number from 1 to 1000. |
| `font-style` | no | `normal` | Chooses the upright or slanted face. One of normal, italic, oblique. |
| `line-height` | no | `1.2` | Sets the line box height as a multiple of the type size. |
| `tracking` | no | `0` | Adds this many pixels between every pair of glyphs. |
| `word-spacing` | no | `0` | Adds this many pixels to every word space. |
| `kerning` | no | `auto` | Decides whether the font's kerning pairs are applied. One of auto, normal, none. |
| `synthesis` | no | `none` | Decides which of weight and slant may be synthesized when no real face carries them. One of none, weight, style, weight-style. |
| `language` | no | — | Names the language tag the text is shaped under. |
| `direction` | no | `auto` | Decides the base writing direction of the text. One of auto, ltr, rtl. |
| `writing-mode` | no | `horizontal-tb` | Decides whether lines run across the page or down it. One of horizontal-tb, vertical-rl, vertical-lr. |
| `baseline-shift` | no | `0` | Raises or lowers the glyphs off their baseline, in pixels. |
| `vertical-align` | no | `baseline` | Places the glyphs on the baseline or as superscript or subscript. One of baseline, super, sub. |
| `tab-size` | no | `4` | Sets how many spaces one tab advances, as a positive whole number. |
| `indent` | no | `0` | Indents the first line of every paragraph, in pixels. |
| `paragraph-before` | no | `0` | Adds this many pixels above every paragraph. |
| `paragraph-after` | no | `0` | Adds this many pixels below every paragraph. |
| `transform` | no | `none` | Recases the text before it is shaped. One of none, uppercase, lowercase, capitalize. |
| `caps` | no | `normal` | Chooses the small-capital variant the font draws. One of normal, small-caps, all-small-caps. |
| `cjk-spacing` | no | `normal` | Decides whether automatic spacing is inserted between CJK and Latin runs, written as `normal` or `none`. |
| `punctuation-trim` | no | `none` | Decides which CJK punctuation is trimmed at the line edges, written as `none`, `start`, `end`, `adjacent` or `all`. |
| `fill` | no | — | Paints one solid glyph fill in this color, ahead of the Paint children. |
| `inline-size` | no | `fixed` | Decides whether the text box hugs its content along the inline axis or fills its placement. One of hug, fixed. |
| `block-size` | no | `fixed` | Decides whether the text box hugs its content along the block axis or fills its placement. One of hug, fixed. |
| `padding` | no | `0` | Insets the text from its placement edges, as one, two or four non-negative pixel values written top, right, bottom, left. |
| `align` | no | `center` | Aligns the text along the inline axis. One of start, center, end, justify. |
| `block-align` | no | `center` | Aligns the text along the block axis. One of start, center, end. |
| `wrap` | no | `word` | Decides where a line may break. One of none, word, grapheme. |
| `overflow` | no | `visible` | Decides what becomes of text that does not fit its placement. One of visible, clip, ellipsis, shrink. |
| `max-lines` | no | — | Caps the number of lines the text occupies, which only an `ellipsis` or `shrink` overflow accepts. |
| `minimum-scale` | no | — | Sets the smallest fraction of the type size a `shrink` overflow may reduce the text to, which that overflow requires and no other accepts. |
| `clip` | no | `false` | Decides whether the text is clipped to its placement. One of true, false. |
| `columns` | no | `1` | Divides the text box into this many columns. |
| `column-gap` | no | `0` | Separates the columns by this many pixels. |
| `metric-edge` | no | `line-box` | Chooses which typographic edge the text is measured and aligned by. One of line-box, cap-height, ink. |
| `point-anchor-inline` | no | `center` | Anchors Point text along the inline axis of its Point. One of start, center, end. |
| `point-anchor-block` | no | `center` | Anchors Point text along the block axis of its Point. One of start, center, end. |
| `path-side` | no | `left` | Chooses which side of the Path the glyphs sit on. One of left, right. |
| `path-orientation` | no | `follow` | Decides whether the glyphs turn with the Path or stay upright. One of follow, upright. |
| `path-start-margin` | no | `0` | Starts the text this many pixels along the Path, which must not be negative. |
| `path-end-margin` | no | `0` | Ends the text this many pixels before the Path does, which must not be negative. |
| `path-align` | no | `start` | Aligns the text within the Path between its margins. One of start, center, end. |
| `path-reverse` | no | `false` | Sets the text along the Path in the opposite direction. One of true, false. |
| `path-overflow` | no | `visible` | Decides whether text longer than the Path is drawn or clipped. One of visible, clip. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Fill>` | many | Fills the glyph interior with a solid color or one gradient child. |
| `<Stroke>` | many | Outlines the glyphs at an exact width, inside, centred on or outside the glyph edge. |
| `<Shadow>` | many | Casts one offset and blurred shadow behind the glyphs. |
| `<Glow>` | many | Spreads one blurred glow around the glyphs. |
| `<Box>` | many | Paints a decorated box behind the frame, content, paragraph, line, run, word or grapheme. It accepts its own gradient, BoxShadow and Tail children. |
| `<Axis>` | many | Sets one variable-font axis to an exact value. |
| `<Feature>` | many | Turns one OpenType feature on or off. |
| `<Decoration>` | many | Draws an underline, overline or line-through in its own paint. |

`<Fill>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `color` | literal | no | Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead. |

`<Stroke>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `color` | literal | no | Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead. |
| `width` | literal | yes | Sets the outline width in pixels, which must not be negative. |
| `placement` | literal (inside, center, outside) | yes | Decides which side of the glyph edge the outline sits on. |

`<Shadow>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `color` | literal | no | Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead. |
| `x` | literal | yes | Offsets the shadow horizontally in pixels. |
| `y` | literal | yes | Offsets the shadow vertically in pixels. |
| `blur` | literal | yes | Blurs the shadow by this many pixels, which must not be negative. |
| `spread` | literal | no | Grows the shadow by this many pixels before it is blurred. |

`<Glow>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `color` | literal | no | Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead. |
| `blur` | literal | yes | Blurs the glow by this many pixels, which must not be negative. |
| `spread` | literal | no | Grows the glow by this many pixels before it is blurred, and must not be negative. |

`<Box>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `target` | literal (frame, content, paragraph, line, run, word, grapheme) | yes | Chooses which text box the decoration is drawn behind. |
| `continuity` | literal (isolated, joined) | no | Joins adjacent boxes into one shape, which only a line, word or grapheme target allows. |
| `color` | literal | no | Paints the box one solid color; omit it and the box takes a Linear or Radial gradient child instead. |
| `padding` | literal | no | Insets the box from the text it sits behind, as one to four pixel values. |
| `radius` | literal | no | Rounds the box corners, as one to four pixel values. |
| `border-color` | literal | no | Paints the box border. |
| `border-width` | literal | no | Sets the border width, as one to four pixel values. |
| `border-style` | literal | no | Chooses the border style. |

`<Axis>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `tag` | literal | yes | Names the four-character variable-font axis. |
| `value` | literal | yes | Sets that axis to an exact value. |

`<Feature>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `tag` | literal | yes | Names the four-character OpenType feature. |
| `enabled` | literal (true, false) | yes | Turns that feature on or off. |

`<Decoration>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `line` | literal (underline, overline, line-through) | yes | Chooses which line is drawn. |
| `color` | literal | no | Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead. |
| `style` | literal (solid, double, dotted, dashed, wavy) | no | Chooses the line style; defaults to `solid`. |
| `thickness` | literal | no | Sets the line thickness in pixels, which must not be negative. |
| `offset` | literal | no | Moves the line away from its default position, in pixels. |
| `skip-ink` | literal (true, false) | no | Decides whether the line breaks around descenders; defaults to `true`. |

```svml
<text:Style id="poster" recipe={editorial} font={exact-font}>
  <text:Fill color="#f8fafc"/>
  <text:Stroke color="#111827" width="3" placement="outside"/>
  <text:Box target="line" continuity="isolated" color="#2563eb" padding="5 10" radius="8"/>
</text:Style>
```

A Style requires at least one `<Fill>` or `<Stroke>`, so that the glyphs are visible; the Paint children paint in the order they are written.

The Recipe is refused when it carries a property name outside the table above.

Every paint states itself as `color` or as one `<Linear angle>` or `<Radial x y>` child, never both; a gradient carries at least two `<Stop>` children, each requiring `offset` and `color` and accepting a normalized `opacity`, written empty and in ascending offset order.

`<Box>` takes `padding`, `radius` and `border-width` as one, two or four non-negative numbers, and draws a border only when `border-color` and a non-zero `border-width` are written together.

`<Box>` accepts `<BoxShadow>` children, which require `color` and accept `x`, `y`, `blur` and `spread`, and one `<Tail>` child, which is written empty and requires `side`, `offset`, `width`, `height` and `color`.

`<Axis>` and `<Feature>` are written empty, and neither repeats a `tag`.

One `<Decoration>` line is declared once.

The TextStyle Record is published under the bare `id`, and the element carries no text content.

### `<Track>`

One Typography Track: independently placed and timed text items on a shared ProgramSpace, lowered to one addressable TypographyTrackProgram and one peer VisualTrack.

**On screen.** Text alone on an otherwise empty Canvas: the glyphs, plus whatever Paint the Style puts around them — fills, outlines, glows, shadows and rounded, bordered, optionally tailed boxes drawn behind the frame, paragraph, line, run, word or grapheme. Each item holds its own region of the Canvas: a Point item is one unwrapped block that hugs its text and hangs off a single coordinate by its inline and block anchors, an Area item flows and wraps inside a rectangle under its own alignment, columns, clipping and overflow, and a Path item strings the glyphs along a curve, on one side of it, turning with it or standing upright. Items switch on and off at their own frame windows and overlap in the stacking order their Styles declare, so titles, labels and captions can occupy different corners at once and outlast or outlive one another. While an item is on screen it plays its Motion: the whole block translating, scaling, rotating, skewing, fading, blurring, recoloring or wiping open from an edge, and its paragraphs, lines, runs, words or graphemes arriving one behind another in a staggered run.

**Preview.** `preview/Track.png`

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this Track and prefixes the identity of every item spec it seals. |
| `space` | reference (@hypit/program-space@1#ProgramSpace) | yes | Fixes the frame domain every item window is projected into. |
| `map` | reference (@hypit/semantic-map@1#CompleteSemanticMap) | no | Chooses the SemanticMap that turns the Selection or Moment an item binds into exact time. |

| Child | Cardinality | Meaning |
|---|---|---|
| `<Point>` | many | One text item anchored at a SpatialPoint. It owns its own document, written as direct text or as P children. |
| `<Area>` | many | One text item flowed inside a SpatialFrame. It owns its own document, written as direct text or as P children. |
| `<Path>` | many | One text item set along a SpatialPath. It owns its own document, written as direct text or as P children. |

`<Point>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this item and the spec the Track seals for it. |
| `placement` | reference (@hypit/spatial@1#SpatialPoint) | yes | Anchors the item at this Point. |
| `style` | reference (@hypit/typography-track@1#TextStyle) | yes | Chooses the compiled Style the item is drawn in. |
| `motion` | reference (@hypit/typography-track@1#TextMotion) | no | Chooses the Motion the item plays; the Track supplies a still Motion otherwise. |
| `content` | reference (@hypit/text@1#Text) | no | Reads an ordinary graph Text as one plain run, which requires the item to be written empty. |
| `during` | expression (@hypit/narrative@1#NarrativeSelection) | no | Spans the whole program when written as `program`, or the window of the referenced Selection. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the window at the cue of the referenced Moment. |
| `for` | literal | no | Fixes the exact length of a Moment window, such as `12f`, `250ms` or `1.5s`. |
| `start` | literal | no | Places the window start at a point expression. |
| `end` | literal | no | Places the window end at a point expression. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds the Selection that resolves `selection.start` and `selection.end` in a start/end window. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds the Moment that resolves `moment.cue` in a start/end window. |
| `occurrences` | literal (one, each) | no | Decides whether a semantic source contributes one window or every occurrence; defaults to `one`. |

Direct text is the item's whole document, read as one paragraph.

`<Area>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this item and the spec the Track seals for it. |
| `placement` | reference (@hypit/spatial@1#SpatialFrame) | yes | Flows the item inside this Frame. |
| `style` | reference (@hypit/typography-track@1#TextStyle) | yes | Chooses the compiled Style the item is drawn in. |
| `motion` | reference (@hypit/typography-track@1#TextMotion) | no | Chooses the Motion the item plays; the Track supplies a still Motion otherwise. |
| `content` | reference (@hypit/text@1#Text) | no | Reads an ordinary graph Text as one plain run, which requires the item to be written empty. |
| `during` | expression (@hypit/narrative@1#NarrativeSelection) | no | Spans the whole program when written as `program`, or the window of the referenced Selection. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the window at the cue of the referenced Moment. |
| `for` | literal | no | Fixes the exact length of a Moment window, such as `12f`, `250ms` or `1.5s`. |
| `start` | literal | no | Places the window start at a point expression. |
| `end` | literal | no | Places the window end at a point expression. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds the Selection that resolves `selection.start` and `selection.end` in a start/end window. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds the Moment that resolves `moment.cue` in a start/end window. |
| `occurrences` | literal (one, each) | no | Decides whether a semantic source contributes one window or every occurrence; defaults to `one`. |

Direct text is the item's whole document, read as one paragraph.

`<Path>` attributes:

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this item and the spec the Track seals for it. |
| `placement` | reference (@hypit/spatial@1#SpatialPath) | yes | Sets the item along this Path. |
| `style` | reference (@hypit/typography-track@1#TextStyle) | yes | Chooses the compiled Style the item is drawn in. |
| `motion` | reference (@hypit/typography-track@1#TextMotion) | no | Chooses the Motion the item plays; the Track supplies a still Motion otherwise. |
| `content` | reference (@hypit/text@1#Text) | no | Reads an ordinary graph Text as one plain run, which requires the item to be written empty. |
| `during` | expression (@hypit/narrative@1#NarrativeSelection) | no | Spans the whole program when written as `program`, or the window of the referenced Selection. |
| `at` | reference (@hypit/narrative@1#NarrativeMoment) | no | Starts the window at the cue of the referenced Moment. |
| `for` | literal | no | Fixes the exact length of a Moment window, such as `12f`, `250ms` or `1.5s`. |
| `start` | literal | no | Places the window start at a point expression. |
| `end` | literal | no | Places the window end at a point expression. |
| `selection` | reference (@hypit/narrative@1#NarrativeSelection) | no | Binds the Selection that resolves `selection.start` and `selection.end` in a start/end window. |
| `moment` | reference (@hypit/narrative@1#NarrativeMoment) | no | Binds the Moment that resolves `moment.cue` in a start/end window. |
| `occurrences` | literal (one, each) | no | Decides whether a semantic source contributes one window or every occurrence; defaults to `one`. |

Direct text is the item's whole document, read as one paragraph.

| Port | Type | Meaning |
|---|---|---|
| `program` | @hypit/typography-track@1#TypographyTrackProgram | The sealed TypographyTrackProgram, which a Mask consumes. |
| `track` | @hypit/composition@1#VisualTrack | The rendered text, an ordinary peer VisualTrack. |

```svml
<text:Track id="titles" space={speech.space}>
  <text:Area id="title" placement={title-frame} style={title-style} during="program">
    EDIT MEANING, NOT TIMELINES
  </text:Area>
</text:Track>
```

A Track requires at least one `<Point>`, `<Area>` or `<Path>`, accepts no text content of its own, and refuses `map` when no item binds a Selection or a Moment.

An item states exactly one window form: `during`, `at` with `for`, or `start` with `end`; `selection` and `moment` bind a start/end window and cannot be written together.

A point expression is `program.start`, `program.end`, `selection.start`, `selection.end` or `moment.cue`, each optionally offset by `+` or `-` and a duration, or a bare duration read as an absolute position.

An item written without `content` owns its own document: direct text becomes one paragraph, and `<P>` children carry rich runs instead.

`<P>` accepts `id` and a `style` reference to a TextStyle, and contains text, `<Span>` and `<Break>` children; a document mixes neither `<P>` children with direct text nor direct text with nested elements.

`<Span>` accepts `id`, a `style` reference, `language` and `direction`, contains text only, and cannot be empty; `<Break>` is written empty and takes no attributes.

## `@hypit/whisperx@1`

### `<Alignment>`

Runs one WhisperX acoustic pass over the speech audio and locates the authored Narrative in it, publishing the aligned transcript and the SemanticMap that carries word timing.

| Attribute | Kind | Required | Meaning |
|---|---|---|---|
| `id` | identifier | yes | Names this alignment and prefixes the bindings it publishes. |
| `narrative` | reference (@hypit/narrative@1#Narrative) | yes | Selects the authored Narrative whose Segments the measured speech is assigned to. |
| `audio` | reference (@hypit/speech@1#SpeechAudioBasis) | yes | Selects the speech audio basis this element measures and aligns against. |

| Port | Type | Meaning |
|---|---|---|
| `evidence` | @hypit/speech-evidence@1#AlignedTranscriptEvidence | The provider-neutral aligned transcript WhisperX returned, addressed as `<id>.evidence`. |
| `map` | @hypit/semantic-map@1#CompleteSemanticMap | The complete SemanticMap placing every authored word in the frame domain, addressed as `<id>.map`. |

```svml
<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>
```

All three attributes are required; the element accepts no children and no text content.

Importing this package is what selects the WhisperX model family; the Runtime separately binds the alignment Need to an Endpoint.
