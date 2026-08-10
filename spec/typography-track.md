# Typography Track Authoring and Expressiveness

Status: implemented pre-release authority for the official two-dimensional Text package. The
complete declared model and browser evidence execute through the frozen repository-internal
Track/Visual IR waist; the author Surface itself is not yet a published ABI.

## 1. Conclusion

The complete Text model is not a larger `TextAppearance` object. It is the orthogonal product of:

```text
authored document
× temporal binding
× spatial form
× text flow
× exact typography
× ordered Paint layers
× deterministic local motion
```

An ordinary transparent title, one background around the complete phrase, one background per
rendered line, isolated word Pills, connected highlighter geometry and a per-grapheme typewriter are
different values in this model. They are not different renderer components and do not require Core,
Film or Composition branches.

"Complete" does not mean putting every effect ever made into one flat object. It means:

1. every ordinary two-dimensional editor Text behavior has a typed place in this model;
2. new Styles and Recipes do not change shared protocols;
3. capabilities with genuinely different inputs or physics use explicit sibling components;
4. any self-contained visual that exceeds the terminal element language can materialize a typed
   compositable Surface without changing Core.

The official Text package owns this author meaning. SVS only provides named immutable Recipe
parameters. Visual IR remains the shared terminal video language. HyperFrames is one renderer of
that language, not the definition of Text.

## 2. Audit evidence

### 2.1 Current Narratage slice

The current `packages/typography-track` implementation has one fixed rectangular box, one plain string
and one `TextAppearance` containing color, size, family, weight, line height, horizontal/vertical
alignment, one background, radius, padding and tracking. Its Surface accepts exactly `text`,
`during` and `appearance`; its Recipe requires exactly eleven scalar properties.

It currently cannot represent:

- paragraphs, explicit line breaks or differently styled inline runs;
- exact font Artifact inputs on the author Surface;
- point text, intrinsic sizing or path text;
- independent frame/content/paragraph/line/run/word/grapheme Paint targets;
- gradients, repeated strokes, repeated shadows, glow or underline layers;
- Unicode-aware word/grapheme behavior, bidirectional runs or vertical text policy;
- item, line, word or grapheme animation;
- text masks or materialized advanced text.

This is a useful end-to-end witness only. Extending `TextAppearance` field by field would preserve
the wrong model.

### 2.2 Twinit evidence

Twinit's later `TextLayoutV2` discovered several correct separations:

- inline/block `hug | fixed` sizing;
- independent padding and inline/block alignment;
- no-wrap, word-wrap and character-wrap;
- visible, clip, ellipsis and shrink overflow;
- LTR/RTL and horizontal/vertical writing;
- frame/content/line/word background targets;
- line-box, cap-height and ink-bound metrics.

Its renderer also implemented solid/gradient glyph fill, outside stroke, shadow, glow, callout
tails, whole-item entry/loop motion, typewriter reveal and line/word backgrounds. Those are valuable
behavioral witnesses.

The implementation also exposes why it must not be copied as the new contract:

- one `TextFields` bag mixes content, layout, Paint, motion and decoration;
- gradient fill and background both compete for the CSS `background` property;
- word backgrounds split on a whitespace regular expression and therefore do not define Unicode
  word behavior;
- typewriter slices JavaScript code units rather than grapheme clusters;
- outside stroke is an implicit duplicated-glyph renderer trick;
- line fragments, shrink-to-fit and cap/ink trimming depend on browser behavior not represented in
  the authored value;
- a pointer silently creates a background and several defaults are renderer inventions;
- there is no rich-run, path-text or repeated Paint-layer model.

An audited historical export contained 32 Text Tracks and 53 Text items. The most frequently used
properties were alignment, font family/size, color, weight, background, radius and padding. Stroke,
uppercase, no-wrap, full-width background, tracking and shadow were also used. The sample contained
no Text animation usage. This proves the ordinary delivery baseline; it does not justify excluding
the broader, well-established editor capabilities below.

### 2.3 External editor attack matrix

The design was checked against official product documentation rather than inferred from UI labels:

| Capability family | Established examples | Required Narratage expression |
|---|---|---|
| advanced typography | tracking, kerning, leading, baseline shift, tabs, caps, super/subscript, underline and Tsume | typed typography and per-run overrides |
| layered appearance | solid/gradient fill, inner/center/outer and repeated strokes, repeated shadows, glow | ordered, repeatable Paint layers |
| geometric text boxes | point titles, area paragraphs, responsive alignment, rolls/crawls | separate Point and Area forms plus motion |
| fragment styling | character/word/line styling and animation | deterministic units and selectors |
| sequential animation | per-character delay, range/follower selectors, direction, spread and loops | selector plus property-animation stack |
| path text | text following and animating along open/closed paths | explicit Path Text form |
| text masks | text revealing explicitly owned media or graphics | sibling component with an explicit media input |
| real 3D text | extrusion, bevel, materials, lighting and per-character 3D | materialized 3D component, not fake 2D fields |

Reference documentation:

- Adobe Premiere: [Text Styles](https://helpx.adobe.com/uk/premiere/desktop/add-text-images/stylize-text/create-text-styles.html)
  and [Text Style Parameters](https://helpx.adobe.com/ca/premiere/desktop/add-text-images/stylize-text/style-parameters-when-applying-from-style-browser.html)
- Adobe After Effects: [Animating Text](https://helpx.adobe.com/uk/after-effects/desktop/animating-text/text-animation/animating-text.html)
- Apple Final Cut Pro: [Adjust Titles](https://support.apple.com/en-qa/guide/final-cut-pro/ver4e32ca5/mac)
- Apple Motion: [Sequence Text Behavior](https://support.apple.com/en-lamr/guide/motion/motn1607c46e/mac)
- Blackmagic Design: [DaVinci Resolve 20 Visual Effects Guide](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Fusion-Visual-Effects.pdf?_v=1757574011000)

This is an expressiveness attack set, not a request to reproduce every product's UI or preset list.

## 3. Ownership and package boundary

The ordinary two-dimensional package remains one package:

```text
@narratage/typography-track
  Point Text
  Area Text
  Path Text
  Text Style / Inline Style declarations
  Text Program validation
  temporal/spatial resolution adapters
  VisualTrack lowering
```

Point, Area and Path are separate author components because they assert different geometry. They
are not a `mode` field which makes ports appear and disappear. They may still lower into one tagged
`TextItemProgram` union and coexist as peer items in one Text Track.

Two capabilities have materially different inputs and stay out of ordinary Text:

- a Text Mask component must explicitly consume both the text shape and the media/graphic it masks;
  it may not sample whichever Track happens to be below it;
- true 3D Text owns extrusion, material, light and camera semantics and normally materializes an
  alpha-bearing Surface.

Those may be separate packages or separately imported components in a later official distribution.
Package count is a distribution decision; their graph contracts must remain separate. Neither case
adds a branch to Core.

The official local Text Mask witness deliberately accepts only one exact single-line Area Text
shape and one explicit still `CompositableSurface`. Rich runs, multiline/Path flow, sequence
animation and timed materials fail closed and use the same materialized-Surface escape route as 3D
Text. This boundary avoids pretending that browser `foreignObject` masking is portable or exact.

## 4. Authored Text Document

A Text item consumes a bounded rich document rather than an HTML fragment or arbitrary tree:

```ts
type TextDocument = {
  readonly paragraphs: readonly TextParagraph[];
};

type TextParagraph = {
  readonly id: string;
  readonly runs: readonly TextInline[];
  readonly style?: TextParagraphStyleRef;
};

type TextInline =
  | { readonly kind: "text"; readonly text: string; readonly style?: TextInlineStyleRef;
      readonly language?: string; readonly direction?: "auto" | "ltr" | "rtl" }
  | { readonly kind: "break" };
```

The exact public names may change during implementation, but the laws do not:

1. text, whitespace, punctuation and explicit breaks preserve author order exactly;
2. a plain string is shorthand for one paragraph with one run;
3. a Span changes only explicitly inheritable typography/Paint, never timing or item placement;
4. source text is segmented only when a selected layout/Paint/motion operation needs units;
5. segmentation is Unicode- and locale-aware and implementation-bound;
6. no Text package uses an LLM to rewrite, split or decorate authored content;
7. `uppercase`, small caps and similar transformations are presentation and never mutate the
   authored document value.

The deterministic unit hierarchy is:

```text
document > paragraph > explicit run > rendered line > Unicode word > grapheme cluster
```

`rendered line` exists only after exact fonts and final geometry are known. A grapheme cluster is
the smallest ordinary author-visible animation/decoration unit. A shaped glyph is not always in
one-to-one correspondence with a Unicode character or grapheme, so the public author model must not
pretend otherwise.

## 5. Three spatial forms

Temporal source and window projection remain governed by
[`track-authoring.md`](./track-authoring.md). Text does not invent `full`, `from`, `until` or another
timing system.

Spatial placement is independent from Text flow. The shared model in
[`spatial-layout.md`](./spatial-layout.md) provides resolved point/frame/path geometry; Text then
interprets that geometry through one of three forms.

### 5.1 Point Text

Point Text is intrinsic text anchored at a resolved point. It normally hugs its content, does not
soft-wrap and uses an explicit inline/block anchor. Manual paragraph breaks remain valid. Ordinary
titles, labels and stickers are Point Text.

### 5.2 Area Text

Area Text flows inside a resolved frame. It explicitly chooses:

- inline and block sizing: `hug | fixed` where meaningful;
- padding on four logical edges;
- inline alignment: `start | center | end | justify`;
- block alignment: `start | center | end`;
- wrap: `none | word | grapheme`;
- overflow: `visible | clip | ellipsis | shrink`;
- optional maximum lines for the truncating/shrinking policies;
- writing direction and writing mode;
- optional columns and column gap;
- clipping to the placement frame;
- metric edge: line box, cap height or ink bounds.

Overflow is honest author intent. `ellipsis` may omit visible authored text and therefore must be
explicit. `shrink` must declare a minimum scale and fail if the complete text still cannot fit; it
must not silently cross that bound. This differs from Caption, which must never clip or discard the
author's display Atoms.

### 5.3 Path Text

Path Text consumes an explicit owned vector path plus Text Document and Style. It owns path side,
orientation, start/end margins, alignment, reversal and overflow. Animating a margin moves text
along the path; animating the path changes the path. It never discovers or samples a shape in
another Track.

Path Text requires either a generic vector/path terminal primitive or an owned materialized
Surface. It cannot be claimed by serializing an untyped SVG/HTML string.

## 6. Typography

Typography is separate from Paint and layout but participates in layout measurement. It includes:

- an exact ordered `FontStackRef`, with environment family names only as an explicit prototype path;
- size, weight and normal/italic/oblique style;
- variable-font axes;
- OpenType feature choices and font synthesis policy;
- kerning, tracking, word spacing and line height;
- language, direction and writing mode;
- baseline shift, tab width, indentation and paragraph spacing;
- underline/overline/strike geometry where it follows glyph metrics;
- text transform, small caps, superscript and subscript presentation;
- CJK-specific spacing/compression controls when supported by the selected layout implementation.

Exact font bytes remain explicit author graph inputs. They are not names hidden in a Recipe and are
not selected by the Runtime. Font shaping/layout implementation identity is bound by the accepting
derivation/render receipt; Core still knows nothing about fonts.

## 7. Ordered Paint model

Paint is an ordered list, not one mutually exclusive set of CSS shortcuts. The Text Program owns
typed layers such as:

```ts
type TextPaintLayer =
  | { readonly kind: "fill"; readonly paint: ColorPaint }
  | { readonly kind: "stroke"; readonly paint: ColorPaint; readonly widthPx: number;
      readonly placement: "inside" | "center" | "outside" }
  | { readonly kind: "shadow"; readonly paint: ColorPaint; readonly offset: Vector;
      readonly blurPx: number; readonly spreadPx: number }
  | { readonly kind: "glow"; readonly paint: ColorPaint; readonly blurPx: number;
      readonly spreadPx: number }
  | { readonly kind: "box"; readonly target: TextPaintTarget;
      readonly continuity: "isolated" | "joined"; readonly decoration: BoxDecoration };
```

`ColorPaint` supports solid, linear-gradient and radial-gradient Paint with an ordered list of color
and opacity stops. Repeating a Stroke or Shadow is legal and order remains semantic. A renderer may
lower an outside stroke through duplicated glyph layers, but that is implementation, not an author
flag whose meaning changes by browser.

Box Paint has these targets:

```text
frame | content | paragraph | line | run | word | grapheme
```

Its decoration independently owns fill, border, padding, corner radii and shadows. `isolated`
creates one decorated unit per target. `joined` unions adjacent selected fragments within each
rendered line and gives the line fragment honest end caps. Invalid combinations, such as continuity
on `frame`, fail during Text validation.

This one rule expresses the common cases:

| Look | Paint value |
|---|---|
| ordinary transparent text | no Box Paint layer |
| one phrase capsule | `target=content` |
| full placement panel | `target=frame` |
| one box per rendered line | `target=line, continuity=isolated` |
| one Pill per word | `target=word, continuity=isolated` |
| connected marker/highlighter | `target=word, continuity=joined` |
| letter tiles | `target=grapheme, continuity=isolated` |

A callout tail is an explicitly authored attachment to one Box Paint layer, with side, offset, size
and its own Paint. It does not silently force a background. Frosted glass is not ordinary Box
Paint because it samples pixels behind the Track; it requires an explicitly owned media input or a
materialized self-contained component.

## 8. Motion and sequence selectors

Motion is independent from Style so the same look can enter, loop and exit differently. One item
may have:

1. item-level finite keyframes over position, scale, rotation, skew, opacity, blur and clipping;
2. path-margin animation for Path Text;
3. one or more sequence animators over text units.

A sequence animator is the product of:

```text
unit selector × selected property channels × keyframes × stagger/order
```

The unit selector may target paragraph, line, run, word or grapheme. It explicitly chooses range,
forward/reverse order, delay/spread, number of cycles and any deterministic random seed. Property
channels include local transform, opacity, blur and glyph Paint values. Typewriter is a grapheme
reveal preset over this model, not string slicing. Rolls and crawls are ordinary item-level motion
over Area Text.

No motion name is a hidden callback. Presets such as `pop`, `spring`, `slide` or `wobble` compile to
finite or analytically bounded package-owned motion values before terminal rendering. Two motion
channels compose through separate owned wrappers or an explicit transform composition order; the
last one does not overwrite the previous one.

## 9. Style declaration, SVS and readable authoring

Declaration and use remain separate. SVS stays a generic scalar Recipe language; it must not learn
Text Paint arrays or become a second renderer. A Text Style Surface reads named Recipes, exact Font
references and repeated structured layer declarations, validates them, then emits one complete
package-owned `TextStyle` Record.

The intended author shape is:

```svml
<text:Style id="plain" recipe={studio.text.plain} font={fonts.inter}/>

<text:Style id="word-pills" recipe={studio.text.word-pills} font={fonts.inter}>
  <text:Box target="word" continuity="isolated" recipe={studio.text.word-pill}/>
</text:Style>

<text:Style id="poster" recipe={studio.text.poster} font={fonts.inter}>
  <text:Stroke recipe={studio.text.poster-outline}/>
  <text:Stroke recipe={studio.text.poster-keyline}/>
  <text:Shadow recipe={studio.text.poster-shadow}/>
</text:Style>

<text:Track id="titles" space={film.space}>
  <text:Point id="hook" style={poster} during={story.selection.hook} placement={hook-point}>
    Nothing hidden in the Runtime.
  </text:Point>

  <text:Area id="explanation" style={word-pills} during={story.selection.body} placement={body-frame}>
    <text:P>Every <text:Span style={plain}>visible word</text:Span> stays authored.</text:P>
  </text:Area>
</text:Track>
```

An item may alternatively consume one ordinary graph `Text` value:

```svml
<copy:Value id="headline">Nothing hidden in the Runtime.</copy:Value>

<text:Track id="titles" space={film.space}>
  <text:Point id="hook" content={headline}
    style={poster} during="program" placement={hook-point}/>
</text:Track>
```

`content={Text}` and inline body content are mutually exclusive. The former materializes one plain
document run from the exact graph value; the latter owns the bounded rich document and may use
`P`, `Span` and `Break`. This prevents a Frontend from copying runtime Text into hidden authored
state while keeping rich typography explicitly owned by this package.

This spelling executes through the current shared temporal/spatial Surface syntax. Its important
properties are:

- the author imports and selects the Typography package;
- Styles are declared before use and are ordinary authored Records;
- simple Style values remain compact;
- repeated layers are repeated declarations, not numbered fields or encoded strings;
- the Markup Surface, not SVS, interprets the Recipe vocabulary;
- exact fonts and timing/placement facts travel on explicit graph edges;
- the resulting Text Program contains no unresolved Recipe and no Runtime/provider choice.

## 10. Compiled pipeline and data gates

```text
Markup Surface
  (authored rich document | graph Text input) + named Style + temporal binding + spatial binding
      │
      ▼
Text Program                         package-owned author truth
      │
      ├── located temporal points ──> projected frame windows
      └── resolved spatial geometry
      │
      ▼
Resolved Text Layout
  exact fonts + shaping + wrapping + fragment geometry + motion schedule
      │
      ▼
VisualTrack
  code-free terminal elements/keyframes or typed owned Surface
      │
      ▼
Composition -> selected final renderer
```

Graph edges carry every external dependency. Text values contain only intrinsic Text meaning. No
upstream Record gains text, role, source, style, font or layout metadata merely because a later Text
consumer needs it.

The layout implementation may use a locked browser, HarfBuzz/Skia/Pango or another exact engine.
It must bind the actual implementation and font bytes. Browser line boxes are not propagated as
generic graph metadata; they are either deterministic terminal layout owned by the renderer receipt
or package-owned resolved geometry used to materialize a Surface.

## 11. Terminal Visual IR findings

The candidate `svml.visual-ir@1` now carries the smallest additions proven by this migration:

- `text-flow` owns the bounded rich document, exact typography, ordered Paint and sequence values;
- `path-text` owns typed vector commands and exact path-flow facts;
- the local `mask` primitive owns exactly one terminal mask source and one content root;
- ordered repeated Paint and Unicode unit animation remain serialized data, never callbacks;
- exact font Artifacts and typed `CompositableSurface` values cross the ordinary Artifact boundary.

The HyperFrames reference compiler implements those primitives without exposing HTML, CSS, SVG or
renderer scripts to author packages. A separately installed non-native Text fixture proves that
extrusion/material/light/camera semantics can remain outside the waist and contribute only a typed
alpha Surface. Unsupported rich masks use the same path.

These remain video-terminal facts, never Core facts. Renderer receipts, Surface-byte validation,
Deck/Ranking witnesses and the final compatibility audit now pass without adding Text meaning to
the shared waist.

## 12. Feedback into Fine Caption

Text and Caption share typography implementation problems, not author truth.

The following may be shared through a focused video-domain implementation library, provisionally
`@narratage/typography`, with no Author Surface and no graph Type unless a real cross-package edge
later requires one:

- Unicode grapheme/word/bidi segmentation;
- exact font-stack loading and shaping;
- gradient stops, ordered strokes/shadows/glows and box decoration geometry;
- line-fragment and joined-Pill geometry;
- grapheme-safe typewriter and deterministic selector evaluation;
- terminal rich-text lowering helpers.

This does not create a universal Text Program. Caption keeps `CaptionDisplaySequence`, Cue, Atom,
speech correspondence and karaoke timing. Text keeps paragraphs, rich runs, point/area/path layout
and arbitrary sequence selectors.

Concrete Caption improvements discovered by this audit are:

1. allow repeated ordered Stroke/Shadow/Glow layers instead of the current one-of-each ceiling;
2. allow arbitrary gradient stops and radial as well as two-stop linear gradients;
3. reuse explicit inner/center/outer Stroke semantics rather than renderer-dependent outline
   behavior;
4. reuse grapheme-safe text transform/reveal and exact shaping;
5. keep joined active-Pill geometry on the shared line-fragment implementation.

Caption must **not** inherit Text ellipsis, clipping, shrink-to-fit, path flow, arbitrary rich-run
timing or selector-generated speech timing. It always displays the author's complete immutable
Atoms and activates only from proven Atom windows.

## 13. Migration order and acceptance gates

Implementation replaced the earlier slice rather than accreting compatibility fields:

1. **Implemented:** Text Document, Point/Area tagged geometry, Text Style and ordered Paint values;
2. **Implemented:** exact fonts, frame/content/paragraph/line/run/word/grapheme Box Paint and rich-run static lowering;
3. **Implemented:** shared Temporal Window Projection and explicit Point/Frame/Path Spatial inputs;
4. **Implemented:** deterministic overflow, direction/writing mode and browser pixel evidence;
5. **Implemented:** item motion and Unicode-aware sequence selectors;
6. **Implemented:** Path Text plus an exact bounded local Text Mask and fail-closed materialization boundary;
7. **Implemented:** the `CompositableSurface` escape route with a separately installed non-native Text package witness;
8. **Implemented:** freeze the repository-internal Visual IR after every repository-wide gate passes.

Acceptance requires browser/render evidence for at least:

- transparent Point Text and fixed Area Text;
- content, frame, multiline line, isolated word, joined word and grapheme boxes;
- nested run styles across wrapping boundaries;
- Latin, CJK, RTL, combining marks and color Emoji with exact fonts;
- repeated outside/inside strokes, multiple shadows, linear/radial gradients and glow;
- visible/clip/ellipsis/bounded-shrink overflow;
- item enter/exit/loop and forward/reverse grapheme/word/line sequencing;
- Path Text;
- explicit Text Mask ownership and one materialized advanced fallback;
- no modification to Core, Runtime, Film or an unrelated Track package.

The declared Text package gates now pass. This establishes a complete pre-release Text package on
the frozen repository-internal Track/Visual IR waist; npm publication and the Text author Surface's
own public-version promise remain separate.
