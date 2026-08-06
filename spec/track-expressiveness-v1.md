# SVML Track Expressiveness Gate v1

Status: executable validation gate; not yet a frozen public Track ABI.

## Purpose

One public Track contract must solve final audiovisual composition without pretending that every
author package shares one authoring model. Text, Caption, B-roll, Ranking and future packages own
their Programs and may revise those Programs independently. They may enter Composition only after
lowering their package-specific meanings into self-contained, frame-exact contributions.

This gate answers one question:

> Can production-used text, media-box, caption, stacking and local-effect behavior lower into the
> same Track waist without adding package-family fields to Track, Composition or Core?

Passing this gate does not make one universal `TrackProgram`. The six Track Program axes—content,
temporal source, window projection, spatial source, occupancy and presentation—remain a separation
discipline for package authors, not six mandatory public fields.

## Three levels that must not collapse

```text
Package Program              Resolved package facts              Public Track
───────────────────────      ────────────────────────────        ─────────────────────
TextLayout / CaptionMode     boxes, glyph runs, windows          Presents
Media sampling policy   ->   source-time and crop mapping   ->   exact frame spans
effect recipe                local animations                    absolute stacking
semantic/spatial locator     final placement                     self-contained elements
```

The Package Program is editable author truth. Resolved package facts are compiler evidence. The
public Track is a terminal audiovisual contribution. Composition must never reconstruct the first
two levels from the third.

"Flat Track" means there is no Track nesting or implicit Track stacking context. A Present may
still own an internal element tree. One authoring Track may emit several Presents at unrelated
absolute stack positions so that peer Tracks can interleave between them.

## Required witnesses

### E1 — Text three-box lowering

The official browser-oriented reference lowering must represent independently:

1. an outer placement frame;
2. an inner layout box controlling wrapping, alignment, direction and overflow;
3. paint targets for the complete frame, shrink-wrapped content, each line or each word.

Paint overflow such as glow or shadow must not become a line-measurement input merely because it is
visible outside the content box. A package may lower a paint target by attaching paint to a
different owned element; the public Track must not acquire a `textBackgroundTarget` field.

### E2 — Caption range/cue/content lowering

A Caption package must be able to lower a hard range boundary, a cue-level alignment/animation
container, shrink-wrapped rows and independently styled or animated words. Dual-font and per-word
paint are package facts. Composition sees only ordinary elements and Presents.

### E3 — Media two-box lowering

A media package must be able to lower one resolved content box containing two independent samples
of the same Artifact:

- a backdrop sample with its own cover/zoom/blur/tone treatment;
- a foreground sample with its own contain/cover/fit-height and focal alignment.

The public Track must not acquire B-roll, focal-preset or blurred-background fields. Artifact
dependency collection must deduplicate the shared content digest.

### E4 — Independent absolute stacking

One package may emit a board at one absolute stack position and icons or labels at other positions.
A Present from another Track must be able to appear between them. Track identity is ownership and
provenance, never a render stacking context.

### E5 — Local motion and handoff

Frame-exact opacity, transform, filter and clip animation may operate on elements owned by one
Present. A package that owns both materials in a handoff may lower complementary Presents. No
ordinary Track may sample the accumulated pixels below it or mutate a sibling Track.

### E6 — Materialized visual fallback

A component whose deterministic visual result cannot be represented by the reference element tree
must be able to materialize its owned result and contribute it as a typed Surface. For transparent
interleaving, the final public contract must bind enough surface information to distinguish a
compositable alpha-bearing visual from an opaque video. Merely naming a `.webm` Artifact does not
prove this property.

## Old-system attack matrix

| Historical behavior | Package-owned truth | Required terminal witness |
|---|---|---|
| Text placement/layout/paint boxes | Text Program | nested owned elements |
| frame/content/line/word background | Text Program | paint attached to the selected owned level |
| caption range/cue/content boxes | Caption Program | nested owned elements and word-local animation |
| dual fonts, CJK, emoji and writing direction | Text/Caption Program | text elements plus locked font/layout dependencies |
| media content box plus foreground/backdrop sampling | media package | sibling media elements referencing one Artifact |
| focal crop and fit-height | media package | deterministic sampling/placement result |
| Ranking board and icons at unrelated z | Ranking Program | several absolute-stack Presents |
| B-roll enter/exit and pair transition | B-roll Program | local frame-exact keyframes over owned Presents |
| arbitrary self-contained visual | component/provider | materialized compositable Surface Artifact |

## Current executable evidence

`packages/hyperframes/test/track-expressiveness.test.ts` constructs package-private lowering
witnesses rather than adding Text, Caption, B-roll or Ranking fields to public contracts. Existing
package tests separately prove ordinary Text, Caption and B-roll Programs lower through the same
Track and Composition path.

The current `VisualTrack / VisualPresent / VisualElement` candidate explicitly binds
`svml.hyperframes-visual-ir@1` and can encode the structural three-box, two-box, word-local and
absolute-stack cases. Two generic terminal facts are now
executable rather than package-family patches:

1. `FontArtifactRef` binds each exact fallback face, weight and style to Blob bytes. Exact text
   lowering emits content-addressed `@font-face` rules and disables font synthesis;
2. `CompositableSurfaceRef` binds dimensions, sRGB color space, opaque/straight alpha semantics and
   still/frame timing to Blob bytes. Animated Surfaces must exactly share the containing Present's
   frame count and ProgramSpace rate.

`packages/hyperframes/test/browser-visual.test.ts` additionally drives one real Hyperframes browser
frame: a real content-addressed font paints glyphs and a 50% straight-alpha PNG composites over a
blue Track at the expected pixel values. This opt-in host test is run with
`SVML_BROWSER_TESTS=1`; it proves the current local renderer path, not every future hosted Runtime.

The IR style vocabulary is now closed rather than arbitrary CSS: components cannot add an unknown
property, environment-dependent value or alternate browser language without changing the protocol
version. The candidate is intentionally still not frozen. Unbound text remains temporarily legal for
candidate-era package migration, and a production Runtime still needs to bind its exact renderer
implementation and validate that Surface bytes satisfy the declared metadata. Those remaining
facts must stay generic; they must not be patched with Caption-, Text- or B-roll-specific fields.

## Freeze criteria

Track v1 may be called a stable public waist only when all of the following hold:

1. E1–E5 have executable structural and HTML-lowering witnesses;
2. official Text/Caption lowerers either bind exact font Artifacts or explicitly materialize their
   glyph result, and the renderer implementation used for layout is receipt-bound;
3. E6 has a typed compositable-Surface path whose Runtime validates the declared media facts and
   records the renderer implementation;
4. installing a new Track package requires no Core, Film, Composition or family registry change;
5. public Track data contains no Caption, Text, B-roll, Ranking or provider discriminator;
6. a package can revise its Program schema while preserving or versioning only its own lowerer;
7. unsupported cross-Track sampling fails closed.

Until then, `svml.visual-track@1` is an executable candidate used to discover the correct waist,
not an open-source compatibility promise.
