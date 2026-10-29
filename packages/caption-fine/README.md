# `@hypit/caption-fine`

The fine-grained, uniform-flow Caption family. Recipes control placement, typography, Paint,
active-word treatment and motion. It renders authored Cues whose tokens all obey the same layout,
type, Paint and motion rules. Spoken time and token order may change the state of that rule; a token
does not carry a private visual role.

The package owns the `Style`, `Caption`, `Use`, `Follow` and `Fallback` declaration meanings and lowers them
to Caption records and graph components. Markup only spells those declarations. Another authoring
frontend can invoke the same package declarations without recreating Caption assembly or validation.

```xml
<caption-fine:Style id="primary" recipe={recipes.caption.primary} font={caption-font}/>

<caption-fine:Caption id="captions-track" document={story.caption} timing={story-captions}
  timeline={speech.timeline} within={vertical.bounds}>
    <caption-fine:Use style={primary}/>
  </caption-fine:Caption>
```

An optional Timeline Region Sequence supplies moving placement when the intended treatment follows
a measured subject. Ordinary Caption uses the Style's placement without regions. The spatial sequence
is authored and attached to the Timeline outside this package; `Follow` gives it consumer-specific meaning:

```xml
<import as="sequence" from="@hypit/spatial-sequence@1"/>
<import as="tracking" source="./heads.regions.svml"/>
<sequence:TimelineRegions id="heads" document={tracking.heads}
  timeline={speech.timeline} canvas={vertical.canvas}/>
<caption-fine:Caption id="captions-track" document={story.caption} timing={story-captions}
  timeline={speech.timeline} within={vertical.bounds} regions={heads}>
    <caption-fine:Use style={primary}/>
    <caption-fine:Follow role="GUEST" series="guest-head" missing="hide"/>
  </caption-fine:Caption>
```

`Follow` explicitly maps one Script Role to one series id. A matching Cue is placed at that region's
top center. `missing="hide"` hides a Cue on a `null` Frame; `missing="authored-placement"` uses the
Style's authored `x` and `y` on that Frame. Roles without a `Follow` remain ordinary fixed captions.
The Style still owns width and anchors, so `anchor-x: center; anchor-y: bottom` places text above the
region. Fine does not detect people, associate identities, interpolate observations or invoke a
Provider. It only consumes the explicit Timeline sequence and binding.

One SVS Recipe freezes three public dimensions:

- **Where**: Region position, anchors, extent, block/inline alignment, wrapping and line limits.
- **How**: the exact font stack, typography, base/active glyph Paint, Cue box and decoration.
- **When**: the visible lead/tail envelope, handoff, Cue/Atom motion, reveal, Karaoke and loops.

An upstream adapter supplies absolute Caption Unit timing. Fine then joins the document's authored
Cues to that complete timing and produces an explicit visible Schedule. It never splits or merges a
Cue. Lead and tail never change the source times used by Karaoke. Later Uses mask earlier
presentation, including Hidden. The final visibility is clipped to the winning Use Window while the
original Cue envelope and animations are preserved.

The Fine Schedule preserves the CaptionTiming's Timeline and document identities. It contains no
Narrative identity. The renderer rejects any mismatched Timeline or document. Studio may expose
lead, tail and handoff as ordinary parameter edits, but Cue rectangles remain read-only timing facts.

Script segments, turns and `||` organize complete Cues. Timed Uses select presentation without
changing that grouping. Fine applies uniform rules to the words of a Cue. A caption whose Cue contains structural roles or
relationships—such as an independently arranged oversized keyword and supporting phrase—can use
a new project Caption family. Reuse the common [Caption content, timed Uses and timing](../caption/README.md),
and implement the new schedule and rendering behavior in that package. This is ordinary component
authorship; different colors or fonts alone can remain Fine Style choices.

```svs
caption.primary {

  x: 0.5; y: 0.9; width: 0.84; height: 0.22;
  anchor-x: center; anchor-y: bottom;
  align: center; block-align: end; inline-size: fixed;
  wrap: word;
  size: 58; line-height: 1; fill: #FFFFFF;
  background: #00000000; padding: "0"; radius: 0;
  karaoke: current; active-fill: #FFD54A;
  cue-enter: spring; cue-enter-frames: 4;
  cue-enter-start-scale: 0.75;
  cue-exit: none;
  lead-frames: 4; tail-frames: 4; handoff: cut;
}
```

## Language, spacing and line layout

The same Caption pipeline serves authored text across writing systems. Script emits lexical words
and individual Han characters as Display Words; punctuation stays with its display word. Fine uses
those units for timing and active Paint, while authored Cues remain complete reading phrases.
Dual Text retains its complete alignment unit even when it displays or speaks several words.

`<组件化|>` authors the same unit as `<组件化|组件化>` without repeating the speech. Fine's `step`
karaoke, active underline and active box treat that unit together using its first-to-last speech
interval. Ordinary Chinese characters around it retain their own activation times. This is an
explicit authored group, not a renderer-selected segmentation, and does not introduce a new Cue.
The underlying character anchors remain available to other Timeline consumers. `wipe` and
`typewriter` still animate inside the complete unit over its interval when deliberately selected.

`word-gap` sizes the separators authored in `CaptionDisplayWord.separatorBefore`. A numeric or
writing-system boundary does not create a space: `3D` and `3개월` stay joined, while `是的 就是这样`
keeps its space. Base text, active text, underlines and joined boxes consume the same boundaries.
For `active-box: trail; active-box-continuity: joined`, Fine measures the complete stationary Cue,
including the inactive suffix, and joins its painted line rectangles. An over-wide word's internal
lines are included. Padding and borders extend beyond those rectangles without changing text flow;
overlapping line backgrounds share one outline and paint translucent color once. Cue motion then
moves text and decoration together.

This decoration uses the HtmlProgram's local `HtmlVisual` extension, owned by Fine. Its
measurement copy uses the same exact-font text and available width, is removed synchronously after
measurement, and is recomputed when a frame is sought (including after fonts finish loading). It
adds no layout records to Script, Caption, Timeline or Runtime. Other backends must support the
selected program format explicitly.

`letter-spacing` controls glyph tracking. Exact font fallbacks supply the required glyphs; the layout
does not select a font by language.

| Control | Behavior |
| --- | --- |
| `width`, `size`, `padding`, `letter-spacing`, `word-gap` | Determine the available space and the text's occupied width. |
| `wrap: word` | Flows at display-unit boundaries and permits an over-wide word to break. Han units are already characters. |
| `wrap: grapheme` | Also permits breaking inside a Latin word. |
| `max-words-per-line` | Optional counted row breaks between complete alignment units. Counts Display Words, normally characters for Chinese; it does not make new Cues. An indivisible Dual Text unit can exceed this count. |
| `max-lines` | Requires `max-words-per-line`; rejects too many counted rows. It does not measure browser wrapping or guarantee one physical line. |

Both count limits are omitted above so the example flows by available width. For a compact
single-line treatment, author coherent Cues and choose a font, size and width that fit those Cues.
`karaoke: off` keeps a complete Cue steady; `current` and `trail` follow its timed units, which are
normally individual characters in Chinese.

| Effect | Recipe | Visible behavior |
| --- | --- | --- |
| Whole-character emphasis | `karaoke: current; karaoke-transition: step` | The complete current unit takes the active Paint at its start, returning to base Paint at its end. |
| Accumulating emphasis | `karaoke: trail; karaoke-transition: step` | Each complete unit takes the active Paint at its start and keeps it for the rest of the Cue. |
| Sweeping fill | `karaoke: trail; karaoke-transition: wipe` | Paint sweeps inside each unit's glyphs during that unit's own time window. |
| Spoken-unit appearance | `atom-reveal: on-start` | Each complete unit appears at its start. |
| Typing appearance | `atom-reveal: typewriter` | Whole graphemes appear in sequence within each unit, starting with its first grapheme at the unit's start. A normal Han unit appears as a complete character. |

`step` is the default Karaoke transition. Choose it for ordinary Chinese character highlighting;
`wipe` deliberately produces partial glyph fills. Cue width and duration do not supply a substitute
clock for either mode. `atom-reveal` controls text appearing, independently of Karaoke recoloring
already visible text. A Dual Text span shares one timing unit, so its display words activate together
under `step`; keep pronunciation markup scoped to the name or expression that needs it.

The Hypit Skill's Caption craft page owns grouping and visual direction.

`font` accepts an exact face or ordered stack. A local file declared through `media:Font` can be the
primary face or a `<caption-fine:Fallback font={...}/>` child, just like a bundled face. See
[Media font assets](../media/README.md#font-files) and the independently installed
[`@hypit/fontsource` adapter](../fontsource/README.md).

The package's Studio facet, published as `@hypit/caption-fine/studio`, reads the same schedule and
authored Use Style references. It presents the actual Cue timing and exposes Use timing and supported
Style edits in the Inspector. Runtime and authoring support therefore ship as one versioned capability
rather than as independently versioned packages.
