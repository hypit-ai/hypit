# `@hypit/caption-fine`

The fine-grained, uniform-flow Caption family. Recipes control placement, typography, Paint,
active-word treatment and motion. It renders authored Cues whose tokens all obey the same layout,
type, Paint and motion rules. Spoken time and token order may change the state of that rule; a token
does not carry a private visual role.

```xml
<caption-fine:Style id="primary" recipe={recipes.caption.primary} font={caption-font}/>
<caption:Program id="captions" document={story.caption} narrative={story} default={primary}/>
<caption-fine:Track id="captions-track" document={story.caption}
  semantic={speech.semantic} program={captions}/>
```

An optional Spatial Region Timeline replaces only the moving placement point. The timeline is authored
numeric input, measured from the actual footage before the composition pass that consumes it;
it is not a face-tracking request. A prior Build may produce that footage with ordinary fixed Caption,
and a later Run can reuse the same media and alignment while changing placement:

```xml
<space:RegionTimeline id="heads" within={vertical} recipe={tracking.heads.default}/>
<caption-fine:Track id="captions-track" document={story.caption}
  semantic={speech.semantic} program={captions} regions={heads}/>
```

With `regions`, every Cue must carry one Script Role. When the Region Timeline contains a measured region for that
Role and Frame, the Track places the Cue at the region's top center. When that Role has a Track but
the current Frame is `null`, the Cue is not rendered: absence of evidence never becomes a guessed
position. A Role with no Track uses the Style's authored `x` and `y`, so unrelated speakers remain
ordinary fixed captions. The Style still owns its width and anchors, so `anchor-x: center;
anchor-y: bottom` puts the Caption immediately above a measured region. The Timeline is finished
external evidence: Fine does not detect people, associate identities, smooth motion, interpolate
missing Frames or invoke a Provider. Without `regions`, the ordinary Recipe `x` and `y` behavior is
unchanged.

This keeps placement inspectable and editable. If a tracked face needs padding or an above-head anchor,
transform the measured numbers while authoring the Region Timeline, then give Caption the result. Do
not hide that transformation in a Provider or ask the Build to rediscover the face.

One SVS Recipe freezes three public dimensions:

- **Where**: Region position, anchors, extent, block/inline alignment, wrapping and line limits.
- **How**: the exact font stack, typography, base/active glyph Paint, Cue box and decoration.
- **When**: the visible lead/tail envelope, handoff, Cue/Atom motion, reveal, Karaoke and loops.

Caption first projects authored Script units onto semantic Word timing. Fine then produces an
explicit visible Schedule and renders that Schedule. Lead and tail never change the semantic Word
times used by Karaoke.

The Fine Schedule preserves the Caption projection's ProgramSpace, Narrative and document identities.
The renderer rejects any mismatched Space or document. Studio may expose lead, tail and handoff as
ordinary parameter edits, but Cue rectangles remain read-only semantic evidence.

Script segments, turns, Style changes and `||` author Cue grouping. Fine rejects word-specific Style
runs. A caption whose Cue contains structural roles or
relationships—such as an independently arranged oversized keyword and supporting phrase—can use
a new project Caption family. Reuse the common [Caption document, Program and timing](../caption/README.md),
and implement the new schedule and rendering behavior in that package. This is ordinary component
authorship; different colors or fonts alone can remain Fine Style choices.

```svs
caption.primary {
  stack-order: 70;
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

The same Caption pipeline serves English and Chinese. Script emits English lexical words and
individual Han characters as Display Words; punctuation stays with its display word. Fine uses
those units for timing and active Paint, while authored Cues remain complete reading phrases.
Dual Text retains its complete alignment unit even when it displays or speaks several words.

`word-gap` applies between Latin words and at Chinese/Latin boundaries. Adjacent Han characters and
full-width punctuation carry no extra word gap. `letter-spacing` controls glyph tracking. Exact
font fallbacks supply the required glyphs; the layout does not select a font by language.

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
normally individual characters in Chinese. The Hypit Skill's Caption craft page owns grouping and
visual direction.

`font` accepts an exact face or ordered stack. A local file declared through `media:Font` can be the
primary face or a `<caption-fine:Fallback font={...}/>` child, just like a bundled face. See
[Media font assets](../media/README.md#font-files) and [the open catalog](../fonts-open/README.md).

The [Fine Studio Companion](../caption-fine-studio/src/index.ts) reads the same schedule and per-Cue
Style references. It presents the actual Cue timing and exposes supported Style edits in the Inspector.
