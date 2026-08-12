# SVML Media Track Authoring

## 1. Conclusion

Full-canvas cutaways, lower evidence cards, corner images, transparent stickers, animated images,
short videos and ordinary replacement sequences are not different terminal Track families. They are
different compositions of the same media concerns:

```text
source material
target time / trigger schedule
source-time occupancy
Placement Frame
ordered local layers and Content Fits
clip and frame Paint
entry / sustain / exit motion
per-layer sampling motion
absolute stacking
optional owned pairwise replacement relationship
optional explicit audio projection
```

They belong in one video-domain package, `@narratage/media-track`, and all lower to
ordinary peer `VisualTrack` and, only when explicitly authored, `AudioTrack` values.

One package does not mean one conditional super-component. The author Surface exposes two
components with different meanings:

```text
Media Item       one independent presentation with one projected window
Media Sequence   ordered members replace one another on one shared surface
```

`Item` and `Sequence` share focused value families and lowering code. They are separate components
because they have different topology, validation and ports. There is no `mode="broll | sequence |
overlay"` field and no step where choosing a mode causes a different hidden component to appear.

A depth-stack Deck is deliberately outside this package. It is a higher-order collection-state
component, not a media primitive. Its model is specified independently in
[`deck-track.md`](./deck-track.md); future Carousel, Fan, Grid or other Deck packages need not adopt
that model.

“B-roll” remains a useful editorial description or Recipe name. It is not a public data Type.

## 2. Boundary

The unified package is an author package and deterministic compiler:

```text
@narratage/media             intrinsic media facts and normalized sources
@narratage/media-pipeline    inspection, stream selection and normalization vocabulary
@narratage/temporal          points, occurrences, windows and trigger schedules
@narratage/spatial           Canvas, Placement Frame, Content Fit and fitted geometry
@narratage/media-track       Item / Sequence author Programs and lowering
@narratage/deck-track        independent depth-stack Deck authoring and lowering
@narratage/composition       terminal VisualTrack / AudioTrack waist
```

It does not:

- generate images or videos;
- choose a model or Provider;
- inspect credentials, URLs or local executables;
- let a Runtime or Provider invent stream-selection policy;
- own the Program clock or Canvas;
- read a sibling Track or the accumulated lower composite;
- add a B-roll, Sequence, Deck or Speech branch to Core, Film, Composition or HyperFrames.

Core sees fixed graph Operations, Records and edges. Runtime executes any explicit media
inspection/normalization or Surface-materialization Needs. Providers do not reinterpret placement,
motion, transitions or audio policy.

## 3. Source truth

Every visual sample enters through an explicit graph edge. The author Surface distinguishes four
forms rather than guessing from one Blob type:

- still image material with a content-addressed Artifact and exact display-oriented extent;
- generated/raw video material, lowered through the generic Media Pipeline using the Track's
  ProgramSpace rate and an explicit visual-only or A/V policy;
- normalized timed visual material with exact frame rate, frame count and extent;
- typed `CompositableSurface` material with exact still/frame timing and alpha mode.

The intrinsic owner remains `@narratage/media`. The Media Track package may use a package-local
resolved union internally, but it must not create another universal media Type or copy provider,
source path, Narrative digest or upstream lineage into every item.

Filename inference is invalid. In particular:

- an animated GIF or animated WebP cannot remain a browser-timed `<img>` because frame `n` must be
  independently renderable during parallel rendering;
- it must be normalized into exact frame-timed visual material or a typed animated Surface;
- a still image remains durationless even when its file format also supports animation;
- an MP4 containing audio does not make that audio audible;
- alpha-bearing visual material must retain an explicit alpha contract.

Several layers may reference the same Artifact. The graph and Artifact collector deduplicate bytes;
the renderer still evaluates every authored sample independently.

## 4. The orthogonal item model

Conceptually, one independent Item owns:

```ts
type MediaItemProgram = {
  readonly id: string;
  readonly temporal: TemporalBinding;
  readonly frame: SpatialFrameInput;
  readonly framePresentation: MediaFramePresentation;
  readonly layers: readonly MediaLayerProgram[];
  readonly motion: MediaLifecycleMotion;
  readonly stacking: AbsoluteStackingIntent;
  readonly sourceAudio?: MediaSourceAudioProjection;
};
```

The axes are:

| Axis | Owns | Does not own |
|---|---|---|
| source | exact still/timed/Surface material | Provider or source discovery |
| temporal | occurrence expansion and item window | source playback |
| frame | Placement Frame | visible Paint or content aspect |
| layers | ordered Paint/media samples | Track-relative z context |
| content fit | one Content Frame per sample | zoom/pan or playback |
| occupancy | source trim and source-time mapping | target window |
| frame presentation | clip, radius, border, shadow, padding | geometry construction |
| lifecycle motion | entry, sustain and exit of owned pixels | member-to-member handoff |
| sampling motion | pan/zoom/rotation inside one media layer | Placement Frame motion |
| stacking | absolute Present position | Track family priority |
| source audio | explicit projection of one selected layer's audio | automatic container audio |

These are package Program facts. They do not become fields on Core or the terminal Track contract.

## 5. Illustrative author Surface

The final Surface must favor named Frames and SVS Recipes over large inline bags. One possible
shape is:

```xml
<media:Track id="editorial-media" map={timing.map} space={speech.space} canvas={vertical}>
  <media:Item
    id="full-cutaway"
    video={demo.video}
    during={story.selection.demo}
    frame={vertical}
    appearance={studio.media.full-cutaway}
  />

  <media:Item
    id="corner-loop"
    surface={reaction.surface}
    at={story.moment.reaction}
    for="2s"
    frame={layout.top-right-sticker}
    appearance={studio.media.corner-loop}
  />

  <media:Sequence
    id="steps"
    frame={layout.lower-card}
    appearance={studio.media.evidence-sequence}
    until={story.selection.explanation.end}
  >
    <media:Member id="step-1" image={step1.image} extent={step1.extent} at={story.moment.step1}/>
    <media:Member id="step-2" image={step2.image} extent={step2.extent} at={story.moment.step2}/>
    <media:Member id="step-3" video={step3.video} at={story.moment.step3}/>
    <media:Handoff from="step-1" transition={studio.media.transitions.push-left}/>
    <media:Handoff from="step-2" transition={studio.media.transitions.crossfade}/>
  </media:Sequence>

</media:Track>
```

This syntax is illustrative. The normative points are:

- declarations and reusable appearance stay outside usage sites;
- every source, Frame, Selection and Moment is an explicit reference;
- `image`, `video`, `media` and `surface` name mutually exclusive source forms; a generic Blob is
  never guessed to be a still or moving source;
- `Item` and `Sequence` are visibly different author meanings;
- shorthand such as `during`, `at`, `for` and `until` lowers to the one shared Temporal algebra;
- no runtime chooses whether something is a cutaway, card or sticker.

### SVML structure and SVS parameter bundles

SVML owns topology: sources, Frames, timing references, Item/Sequence membership, Handoff edges,
labels and sound inputs. SVS owns named reusable parameter bundles: Content Fits, frame Paint,
clipping, motion parameters and transition appearance.

An SVS Recipe cannot hide a source edge, create a member, select a Provider or cause two independent
Items to become a Sequence. Applying one transition Recipe to a whole Sequence materializes that
choice on every authored Handoff in the resolved Program. Thus Recipes stay concise without
becoming a second graph language.

### Small framed inset with a smooth rise

A small box is not another component. It is one ordinary Item whose explicit Placement Frame is
smaller than Canvas. Structure remains readable at the use site:

```svml
<space:AnchoredFrame id="product-inset" within={safe}
  x="50%" y="78%" width="82%" height="28%" anchor="center"/>

<media:Track id="proof" map={timing.map} space={speech.space} canvas={vertical}>
  <media:Item
    id="product-proof"
    video={product.video}
    during={story.selection.proof}
    frame={product-inset}
    appearance={studio.media.fuzzy-card}
    motion={studio.motion.smooth-rise}
  />
</media:Track>
```

The referenced Recipes conceptually resolve independent parameters such as:

```text
media.fuzzy-card
  content fit        contain or cover
  frame fill         explicit color/gradient/transparent Paint
  content padding    exact pixels
  frame clip         rounded rectangle or owned shape
  edge treatment     border/shadow, or an explicit rough-edge layer

motion.smooth-rise
  enter operator     translate
  from               below the Canvas or an exact positive y offset
  to                 resolved Placement Frame pose
  duration           exact frames
  easing             ease-out, or a package-compiled custom frame curve
```

“Below” must be unambiguous. `below-canvas` derives an off-canvas starting pose from Canvas and the
resolved Item extent; `offset-y: 120px` starts below the final Frame without necessarily leaving the
picture. Both lower to frame-exact local transforms and neither changes the final Spatial Frame.

A normal soft or glowing edge lowers to an owned border plus box shadow/drop shadow. A genuinely
irregular furry, torn-paper or noisy edge is not a magic `border-style`: it is an explicit local
layer, such as a transparent frame Artifact or a deterministic `CompositableSurface`. Because that
layer affects graph topology and Artifact collection, its source must be connected in SVML (for
example as `<media:Layer surface={fuzzyFrame.surface}/>`); SVS may style it but cannot hide the source
edge. The outer lifecycle wrapper moves the frame Paint, edge layer and content together.

Built-in easing names may lower directly to Visual IR. A richer Bézier or spring Recipe remains a
Media-package concern and may be deterministically sampled into frame-addressed keyframes; it does
not require Core, Composition or Runtime to learn a new motion type.

## 6. Independent Item timing

An Item uses the common pipeline from [`track-authoring.md`](./track-authoring.md):

1. locate Selection, Moment or Program points;
2. expand `one` or `each` occurrences;
3. project one target window per occurrence;
4. intersect and validate against ProgramSpace;
5. evaluate every layer's source trim and occupancy inside that item window;
6. evaluate lifecycle and sampling motion;
7. emit self-contained Presents.

Independent Items remain independent. Their windows may overlap, and they compose by their explicit
absolute stacking keys. Program order does not make them exclusive, clip a lower-priority item,
auto-stitch gaps or infer a Sequence.

A full-screen B-roll is simply an Item whose Placement Frame equals Canvas and whose foreground
layer commonly uses `cover`. A small image, GIF or video is the same Item against a smaller Frame.
“Do not cover the face” is not a Media mode: the author consumes a suitable named Frame, or an
upstream subject-aware layout component explicitly produces one.

## 7. Ordered local layers

One Item owns an ordered list of local layers inside one Placement Frame:

```ts
type MediaLayerProgram =
  | MediaFramePaintLayer
  | MediaSampleLayer;

type MediaSampleLayer = {
  readonly id: string;
  readonly source: MediaSourceInput;
  readonly fit: ContentFit;
  readonly trim?: VisualSourceTrim;
  readonly occupancy: VisualOccupancy;
  readonly appearance: MediaSampleAppearance;
  readonly samplingMotion?: MediaSamplingMotion;
};
```

The complete backing cases from [`spatial-layout.md`](./spatial-layout.md) are ordinary layer lists:

- transparent: no backing layer;
- solid or gradient: one frame-Paint layer;
- self blur: the same source enters one cover/blur layer and one foreground layer;
- alternate backing: a different explicit source supplies the backing layer;
- decorated card: Paint, border/shadow/padding and one or more media layers.

Every media layer derives its own Content Frame from its own intrinsic extent and `ContentFit`.
There is no special foreground/background pair and no one shared inner box.

Frame-level clipping is explicit: none, Placement Frame or an owned shape. Radius, border, shadow,
padding and frame Paint are presentation. They cannot mutate Spatial geometry or sample another
Track.

## 8. Source-time occupancy

Static material has no intrinsic playback duration and paints for the complete interval in which
its layer is active. A timed video, animated image or animated Surface uses explicit trim followed
by the common visual occupancy law:

```text
once/start     play from the source head, then disappear or truncate
once/end       align the source tail to the window end
hold/start     play from the head, then hold the last visual frame
hold/end       hold the first visual frame, then play to the end
loop/start     loop from source-head phase
loop/end       choose phase so the source tail meets the window end
stretch        map the complete effective source interval onto the window
```

There is no `auto`, `native`, `finish`, `freeze` or `phased` author enum. Images do not receive a
fake playback mode. Source trim executes before occupancy. Spatial contain/cover and temporal
stretch remain unrelated.

The Item target window remains valid even when one `once` layer ends early. Other Paint or media
layers may continue. An author who wants the complete item to remain visible chooses `hold`, supplies
a persistent layer or authors a shorter target window; the compiler never shrinks the Item by
guessing which layer is primary.

## 9. Media motion has four separate channels

Media motion has four explicitly separated package-owned channels:

```ts
type MediaLifecycleMotion = {
  readonly enter?: MediaEdgeMotion;
  readonly sustain?: readonly MediaSustainMotion[];
  readonly exit?: MediaEdgeMotion;
};

type MediaSamplingMotion = {
  readonly keyframes: readonly MediaSamplingKeyframe[];
};
```

### Entry motion

Operates on all pixels owned by one Item or Group at the beginning of its visible envelope.
Reasonable typed Recipes include fade, directional slide, scale, pop, bounce, local blur reveal,
wipe, flip and spin.

### Sustain motion

Operates during the visible envelope. Float, breathe, pulse, wobble, shake and drift are reasonable
operators. The authored ordered list is evaluated deterministically; multiple transforms cannot
silently overwrite one another.

### Exit motion

Operates on all owned pixels at the end of the envelope. It uses its own operator and duration; it
is not automatically the reverse of entry.

### Sampling motion

Operates on one media layer's already fitted Content Frame. Normalized keyframes may animate zoom,
source/content-point displacement and rotation. Ken Burns is a sampling-motion Recipe, not a Base
effect and not an occupancy mode.

Entry and exit keep their authored durations even when they overlap. The package evaluates both at
each frame and deterministically composes their independent opacity, transform, filter and clip
channels. It never proportionally shortens either side and never runs the Item twice. The visible
Item window remains the final clip.

The transform stack is fixed so channels cannot overwrite one another:

```text
absolute Present stacking
└─ fixed Placement Frame
   └─ group/item entry + exit wrapper
      └─ ordered sustain wrappers
         └─ member handoff wrapper (Sequence only)
            └─ frame Paint and clip
               └─ base fitted Content Frame
                  └─ layer sampling motion
                     └─ media pixels
```

The lowerer may algebraically compose matrices or emit nested Visual IR elements, but the order and
pixels must be identical. These are Media package contracts, not a generic public `effects` bag.

## 10. Sequence: explicit member replacement

A Sequence owns two or more nested Members that share one Placement Frame and one outer lifecycle.
It is created explicitly; nearby Items, overlapping windows or a transition Recipe never imply
membership.

Each Member has:

- a stable author identity;
- explicit media layers and per-layer fit/occupancy/sampling motion;
- exactly one activation point derived from a Moment or one Selection boundary;
- no independent outer entry or exit motion.

The Sequence has one explicit terminal point. For activation frames `p1..pN` and terminal `T`:

```text
p1 < p2 < ... < pN < T

logical member 1 phase   [p1, p2)
logical member 2 phase   [p2, p3)
...
logical member N phase   [pN, T)
```

Source occurrence order is authoritative. The compiler never sorts by physical time. Missing,
equal-frame, reversed or out-of-program activations fail the complete Sequence atomically.

Every adjacent pair owns one explicit Handoff. No transition default exists only in an editor or
Runtime; “apply to all” materializes the same chosen transition on every edge.

### Pair transition

The official initial set remains:

- cut;
- crossfade;
- push;
- wipe;
- cover;
- page turn.

One transition owns operator identity, exact duration, typed parameters and a boundary-position
ratio `r` in `[0,1]`. At logical boundary `p` and duration `d`:

```text
handoff.start = p - r × d
handoff.end   = p + (1-r) × d
```

Frame quantization preserves the exact total transition length. Adjacent handoff windows may not
overlap; invalid duration fails instead of creating an implicit three-source transition.

During a handoff, outgoing and incoming Member surfaces are both owned by the Sequence. Their media
samples run continuously across their expanded visual spans. The transition changes neither
ProgramSpace nor upstream Selection/Moment points.

Sequence handoffs may operate only inside their shared Placement Frame. This makes cut, crossfade,
push, wipe, cover and page turn honest local relationships. An outer handoff against
A handoff against an accumulated lower composite is invalid because it would read and mutate
unrelated lower Tracks.

The Sequence itself may use an ordinary entry/exit motion. A full-screen fade over a lower Track is
valid because only the Sequence opacity changes; pushing or page-turning the lower Track is not.

## 11. Audio is explicit and projected separately

Visual material remains muted unless the author explicitly selects source audio from exactly one
named media layer. This is item-level so a foreground and its self-blurred copy cannot accidentally
mix the same source twice.

```ts
type MediaSourceAudioProjection = {
  readonly fromLayer: string;
  readonly gain: number;
};
```

The audio projection reuses the selected layer's exact trim, playback mapping and resolved schedule.
Each Sequence edge separately owns its audio relationship:

- `cut` switches audibility at the logical activation point even when visual surfaces overlap;
- `crossfade` uses the explicitly authored audio handoff window;
- visual transitions never silently choose an audio transition.

Entry/exit or handoff SFX are explicit audio Artifact inputs with explicit gain. They are lowered at
the exact resolved entry, exit or boundary point. They are not package-global filenames, mutable
sound-library defaults or hidden lane SFX.

The compiler does not return one atomic `MediaProduct` containing both terminal Tracks. It resolves
one package-owned Media Program and provides separate deterministic projection Operations:

```text
Resolved Media Program ─┬─> project visual ─> VisualTrack
                        └─> project audio  ─> AudioTrack
```

Consequently either terminal output may be targeted, replaced or satisfied independently by the
Run Graph. When both are demanded, they still share the same resolved schedule through an explicit
graph edge rather than duplicated timing metadata.

A visual-only Item does not demand audio normalization or rendering merely because its source
container has an audio stream.

## 12. Stacking and flat Tracks

The Media Track itself has no z-index. Every resolved top-level Item or Sequence surface and any
separately interleavable member/layer emits absolute Present stacking keys.

Frame Paint and tightly coupled media samples may remain in one Present-local element tree. When a
peer Track must be able to appear between a board, card, icon or layer, the package emits separate
Presents with separate absolute keys. Track ownership never creates a stacking context.

Temporary ordering inside a Sequence handoff is package-owned and exists only for that relation's
frames. It does not reserve a global z band.

## 13. Speech Spine's restricted Media projection

Speech Spine should stop maintaining a second ad-hoc media renderer. Its visual projection uses the
same Media lowering implementation with a deliberately restricted generated Program:

```text
one normalized speech-bearing Take per Segment; its visual stream is optional
exact already-established Segment frame span
explicit authored Spatial Frame
one foreground layer
explicit fit and absolute stacking order chosen by the author
muted visual
cut between contiguous takes
no entry, sustain or exit motion
no Sequence state
no source-audio projection
```

The Speech author Surface accepts raw `video=` and expands the same generic inspection and
normalization graph before assembly, selecting primary moving video plus default audio at the
Spine's explicit frame rate. Raw `audio=` expands an audio-authoritative normalization graph and
contributes no visual Present; it never manufactures black media. Prepared `media=` remains a
direct exact input. Visual Takes inherit the Spine's explicit `visual-frame`,
`visual-appearance` and `visual-z`, with per-Take overrides for those same limited axes. After assembly, Speech
audio remains the separate canonical `SpeechAudioBasis -> AudioTrack` projection; the restricted
visual lowerer itself remains muted and does not rediscover container audio.

This can be a code dependency on focused Media lowering helpers. It does not require exposing a
public `MediaProgram` graph Type when no external component consumes that intermediate value. If a
real graph consumer appears later, the package may expose its own versioned resolved Type; Core
still does not register Media meaning.

The author imports Speech Spine, whose manifest declares its package dependency. Authors do not
need to import a second parser merely because the implementation reuses Media lowering.

Ordinary Media Items may consume `during={story.segment.answer}` directly. This is not an implicit
Selection: Temporal resolves the Segment's already-existing structural start/end anchors. The same
Item can still consume authored Selection and Moment values when those are the actual intent.

## 14. Package shape

The intended package relationships are:

```text
@narratage/media-track
├─ author Surfaces: Track, Item, Sequence, Member, Handoff
├─ package-owned Program validators
├─ pure Item window/layer/motion lowering
├─ pure Sequence schedule + pair transition lowering
├─ VisualTrack projection
└─ AudioTrack projection

depends on
├─ @narratage/media
├─ @narratage/temporal
├─ @narratage/spatial
├─ @narratage/svs
└─ @narratage/composition
```

The package may use internal focused files or implementation-only libraries. It must not
create one umbrella authoring library shared by Text, Caption, Ranking and Media, and it must not
require a release of Core when a new media Recipe, motion operator or component package is added.
