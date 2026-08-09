# SVML Track Expressiveness Gate

Status: all E1–E8 gates execute; repository-internal `svml.visual-track@1` waist frozen pre-publication.

## Purpose

One public Track contract must solve final audiovisual composition without pretending that every
author package shares one authoring model. Text, Caption, Media, Ranking and future packages own
their Programs and may revise those Programs independently. They may enter Composition only after
lowering their package-specific meanings into self-contained, frame-exact contributions.

This gate answers one question:

> Can production-used text, media-box, caption, stacking and local-effect behavior lower into the
> same Track waist without adding package-family fields to Track, Composition or Core?

Passing this gate does not make one universal `TrackProgram`. The six Track Program axes—content,
temporal source, window projection, spatial source, occupancy and presentation—remain a separation
discipline for package authors, not six mandatory public fields. The shared authoring laws and the
current temporal design are specified in [`track-authoring.md`](./track-authoring.md).

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

### E3 — Media two-frame lowering

A media package must be able to lower one resolved Placement Frame containing two independent
samples of the same Artifact. Each sample derives its own Content Frame according to
[`spatial-layout.md`](./spatial-layout.md):

- a backdrop sample with its own cover/zoom/blur/tone treatment;
- a foreground sample with its own contain/cover/fit-height and focal alignment.

The public Track must not acquire B-roll, focal-preset or blurred-background fields. Artifact
dependency collection must deduplicate the shared content digest.

### E4 — Independent absolute stacking

One package may emit a board at one absolute stack position and icons or labels at other positions.
A Present from another Track must be able to appear between them. Track identity groups one
self-contained render contribution; provenance lives in the Graph/Derivation and Track never forms
a render stacking context.

### E5 — Local motion and handoff

Frame-exact opacity, transform, filter and clip animation may operate on elements owned by one
Present. A package that owns both materials in a handoff may lower complementary Presents. No
ordinary Track may sample the accumulated pixels below it or mutate a sibling Track.

The Media package must additionally prove that entry, sustain, exit, per-layer sampling motion and
Sequence pair handoffs remain separate channels with a fixed composition order. The independent
Depth-Stack Deck package must prove that its collection-state reflow composes with Card-local motion
without adding Deck meaning to the terminal Track. The complete models are specified in
[`media-track.md`](./media-track.md) and [`deck-track.md`](./deck-track.md).

### E6 — Materialized visual fallback

A component whose deterministic visual result cannot be represented by the reference element tree
must be able to materialize its owned result and contribute it as a typed Surface. For transparent
interleaving, the final public contract must bind enough surface information to distinguish a
compositable alpha-bearing visual from an opaque video. Merely naming a `.webm` Artifact does not
prove this property.

### E7 — Generic audio lowering

The official Audio package must lower arbitrary explicit normalized sources, source trim, one-shot,
loop, bounded pitch-preserving stretch, start/end alignment, gain and fades into the same peer
`AudioTrack` waist. Overlapping clips mix without priority clipping or a privileged Base lane.
Container stream selection, loudness processing and Provider placement remain explicit upstream or
downstream graph work. The complete boundary is specified in
[`audio-track.md`](./audio-track.md).

### E8 — Self-contained screen overlay

A full-canvas effect must lower to ordinary absolute-stack Presents made from owned Visual IR
elements or an owned alpha-bearing Surface. It cannot read the accumulated lower composite, reserve
the highest z-index or introduce a post-composition phase. Source-free blur, color-adjust and real
zoom-blur therefore fail closed; their honest form consumes explicit media or Surface input outside
the Screen Overlay package. See [`screen-overlay.md`](./screen-overlay.md).

## Old-system attack matrix

| Historical behavior | Package-owned truth | Required terminal witness |
|---|---|---|
| Text placement/layout/paint boxes | Text Program | nested owned elements |
| frame/content/line/word background | Text Program | paint attached to the selected owned level |
| caption range/cue/content boxes | Caption Program | nested owned elements and word-local animation |
| dual fonts, CJK, emoji and writing direction | Text/Caption Program | text elements plus locked font/layout dependencies |
| media content box plus foreground/backdrop sampling | media package | sibling media elements referencing one Artifact |
| focal crop and fit-height | media package | deterministic sampling/placement result |
| full-frame B-roll, corner GIF and lower media card | Media Item + Recipes | the same Item lowering against different Frames |
| explicit media replacement group | Media Sequence | coordinated owned outgoing/incoming Presents |
| visible card history and depth reflow | Depth-Stack Deck Track | package-owned collection state over ordinary Presents |
| Ranking board and icons at unrelated z | Ranking Program | several absolute-stack Presents |
| Media enter/exit and pair transition | Media Program | local frame-exact keyframes over owned Presents |
| arbitrary self-contained visual | component/provider | materialized compositable Surface Artifact |
| music/SFX/additional voice placement | Audio Program | ordinary frame-exact AudioTrack clips |
| flash/vignette/grain/veil | Screen Overlay Program | owned full-canvas Presents or alpha Surface |
| blur/color transform of a picture | explicit-input media effect | transformed owned material, never backdrop sampling |

## Current executable evidence

`packages/hyperframes/test/track-expressiveness.test.ts` constructs package-private lowering
witnesses rather than adding Text, Caption, Media or Ranking fields to public contracts. Existing
package tests separately prove ordinary Text, Caption and Media Programs lower through the same
Track and Composition path.

The current `VisualTrack / VisualPresent / VisualElement` candidate explicitly binds
`svml.visual-ir@1` and can encode the structural three-box, two-box, word-local and
absolute-stack cases. Two generic terminal facts are now
executable rather than package-family patches:

1. `FontArtifactRef` binds each exact fallback face, weight and style to one or more Blob sources.
   Unicode-range shards remain one logical face; exact text lowering emits content-addressed
   `@font-face` rules for every source and disables font synthesis;
2. `CompositableSurfaceRef` binds dimensions, sRGB color space, opaque/straight alpha semantics and
   still/frame timing to Blob bytes. Animated Surfaces must exactly share the containing Present's
   frame count and ProgramSpace rate.

`packages/hyperframes/test/browser-visual.test.ts` additionally drives real Hyperframes browser
frames: installed content-addressed open fonts paint Latin, CJK and emoji/symbol glyphs through an ordered fallback
stack; Text proves Point/Area/Path layout, all Box targets, rich runs, horizontal/vertical flow,
clip/ellipsis/bounded shrink, ordered Paint, local Mask and forward/reverse selector clocks; Fine
Caption proves multiline wrapping, full glyph Paint, every glyph karaoke mode and joined trail Pill
line geometry; DepthStack Deck proves explicit old/new collection-state reflow, exact labels and
byte-identical one-worker/partitioned frames; all eleven official Screen Overlay components preserve identical pixels under sequential and parallel frame rendering; and a
50% straight-alpha PNG composites over a blue Track at the expected pixel values. This opt-in host
test is run with `SVML_BROWSER_TESTS=1`; it proves the current local renderer path, not every future
hosted Runtime.

The IR style vocabulary is closed rather than arbitrary CSS: components cannot add an unknown
property, environment-dependent value or alternate browser language without changing the protocol
version. Every terminal text element now carries a non-empty exact Font Artifact stack; system-font
fallback and a prototype family are invalid. The Runtime binds its locked implementation in the
generic Receipt. HyperFrames additionally records the exact local browser digest or configured
remote renderer-deployment digest in receipt-covered metadata. Shared ffprobe-based Surface-byte
verification proves declared dimensions, timing, SDR/sRGB and alpha facts before local staging;
Endpoints without this ability decline Surface-bearing documents.

E1–E5, E7 and E8 now have their official package witnesses. `@narratage/text-track` proves the
complete three-box/Text terminal model without public Text fields; Caption and Media prove their
independent package models. `@narratage/audio-track` proves the exact
48 kHz source/target mapping, overlap law, bounded stretch and one shared local/remote
`AudioProgramPlan`; `@narratage/screen-overlay` proves only self-contained owned pixels, explicit
seeds, flat stacking and fail-closed rejection of lower-composite effects;
`@narratage/deck-track` proves pure absolute-frame collection reflow over the union of old/new
visible Cards while reusing Card-local Media lowering. `@narratage/ranking` supplies the real E4
witness: board, stage and independently stacked Items interleave with an unrelated peer Track,
while all four Ranking components retain frame-pure progressive state under partitioned browser
rendering. E6 is complete through the typed path, independently installed non-native Text witness,
byte verifier and fail-closed Endpoint support check.

## Freeze criteria

The repository-internal Track v1 waist satisfies all of the following:

1. E1–E8 have executable structural, HTML-lowering and audio-plan witnesses;
2. official Text/Caption lowerers either bind exact font Artifacts or explicitly materialize their
   glyph result, and the renderer implementation used for layout is receipt-bound;
3. E6 has a typed compositable-Surface path whose Runtime validates the declared media facts and
   records the renderer implementation;
4. installing a new Track package requires no Core, Film, Composition or family registry change;
5. public Track data contains no Caption, Text, Media, Ranking or provider discriminator;
6. a package can revise its Program schema while preserving or versioning only its own lowerer;
7. unsupported cross-Track sampling fails closed.

The implementation is therefore frozen for subsequent repository package work. Public npm
publication, untrusted-code isolation and final release versioning remain separate release gates;
they do not reopen the video meaning of this waist.
