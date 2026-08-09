# Shared Spatial Layout

Status: executable foundational authority for shared Spatial geometry. `@narratage/spatial`
implements CanvasSpace, Frame/Point/Path, IntrinsicExtent, ContentFit and pure fitting; Film now
consumes the same explicit CanvasSpace as Track layout. Text, Media and Ranking migration witnesses
and the public ABI freeze remain incomplete.

## 1. Conclusion

The shared spatial system owns coordinate geometry, not Text, Media or CSS. Its stable vocabulary is:

```text
CanvasSpace       exact output coordinate system
SpatialPoint      one point in that system
SpatialFrame      one positive rectangular region
SpatialPath       one explicit vector path
IntrinsicExtent   one content item's natural two-dimensional size/aspect
ContentFit        how an extent is sized and aligned against a Frame
FittedContent     the deterministic result of that fit
```

When a visual component consumes a `SpatialFrame`, that frame plays the role of its
**Placement Frame**: where the component is placed and where frame-level Paint may exist. Every
actual text/media sample then derives its own **Content Frame** from its intrinsic dimensions and a
`ContentFit`.

These are the two frames. They are not always nested:

```text
contain                 cover

Placement Frame         Content Frame
┌──────────────┐       ┌──────────────────┐
│  ┌────────┐  │       │  ┌────────────┐  │
│  │Content │  │       │  │ Placement  │  │
│  │ Frame  │  │       │  │   Frame    │  │
│  └────────┘  │       │  └────────────┘  │
└──────────────┘       └──────────────────┘
```

Calling the second one an "inner box" is therefore incorrect. Under `cover`, zoom or local motion,
the Content Frame may exceed the Placement Frame.

One Placement Frame may contain several explicit samples. A solid backing has no Content Frame. A
blurred sample and a foreground sample each have their own Content Frame, even when they reference
the same Artifact. There is no single global "inner frame" shared by every layer.

## 2. Boundary

The focused video-domain package is provisionally named `@narratage/spatial`. It owns pure types,
validators, author Surfaces for reusable geometry and deterministic geometry Producers. It does not
own:

- temporal windows or intrinsic media playback;
- text wrapping or glyph measurement;
- media decoding, stream selection or container rotation;
- backgrounds, blur, opacity, color, borders or shadows;
- z-order, transitions or local motion;
- Composition, Runtime, Provider or Core behavior.

Those facts meet Spatial only through graph edges. For example, Media Inspection selects one visual
stream and produces its display-oriented extent; a Media package explicitly converts that extent
into `IntrinsicExtent` and gives it to Spatial fitting. Spatial never opens an MP4 or guesses which
stream is primary.

Installing or revising this package must not change Core. The Core sees ordinary typed Records and
Operations.

## 3. CanvasSpace

`CanvasSpace` establishes the exact coordinate system before any Track is authored:

```ts
type CanvasSpace = {
  readonly contract: "svml.canvas-space@1";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly origin: "top-left";
  readonly xDirection: "right";
  readonly yDirection: "down";
  readonly pixelAspect: "square";
};
```

Width and height are positive integers. Color, clear Paint, frame rate and duration are not spatial
facts and remain outside this value.

The Canvas must be declared before Tracks and later connected to Film/Composition as the same graph
value. The current Film Surface hides width and height inside the final Film declaration, which is
too late for exact Text and Media layout. Its rewrite must separate Canvas declaration from final
Track assembly rather than copying width/height into every Track Recipe.

An intended source shape is:

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>

<!-- Track declarations consume vertical or Frames derived from it. -->

<film:Film id="main" canvas={vertical} space={program} appearance={studio.film.main}>
  ...
</film:Film>
```

The exact Surface spelling remains pre-freeze. The one-value dataflow is normative.

## 4. SpatialFrame construction

A resolved `SpatialFrame` is a finite rectangle in Canvas pixel coordinates:

```ts
type SpatialFrame = {
  readonly contract: "svml.spatial-frame@1";
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
};
```

Width and height must be positive. `xPx` and `yPx` may be negative or extend beyond Canvas. An
off-canvas Frame is useful for entry/exit motion and must not be silently clamped, intersected or
rejected. Canvas rasterization determines which pixels are visible. Clamping is always an explicit
projection choice.

Author inputs may use Canvas-relative percentages or pixels. They compile into this one resolved
form before a consumer lays out its content. Percentages are relative to the explicitly connected
parent Frame's width/height, not to whichever DOM container a renderer happens to create.

Three author components cover the normal construction meanings without a mode field:

1. `Frame`: four explicit edges inside a parent Canvas/Frame;
2. `AnchoredFrame`: one target point, one width/height and one of nine self anchors;
3. `AspectFrame`: one target point, one primary size and one explicit or connected aspect ratio.

Conceptually:

```svml
<space:Frame id="safe" within={vertical}
  left="6%" top="4%" right="94%" bottom="96%"/>

<space:AnchoredFrame id="card" within={safe}
  x="50%" y="78%" width="82%" height="28%" anchor="center"/>

<space:AspectFrame id="sticker" within={safe}
  x="100%" y="100%" width="32%" aspect={portrait.extent} anchor="bottom-right"/>
```

`Frame` does not mean a visible box. It produces geometry only. `AspectFrame` may consume a generic
`IntrinsicExtent` edge; it does not depend on Media.

The nine canonical anchor names are:

```text
top-left       top-center       top-right
middle-left    center           middle-right
bottom-left    bottom-center    bottom-right
```

The compiled math is point attachment, not nine hard-coded layout algorithms:

```text
frame.x = target.x - frame.width  × selfAnchor.x + offset.x
frame.y = target.y - frame.height × selfAnchor.y + offset.y
```

Each named anchor is merely a readable `(0 | 0.5 | 1, 0 | 0.5 | 1)` pair. An advanced Surface may
expose arbitrary normalized anchor points without changing the compiled contract.

Safe area, left column, title region and product region are ordinary named Frames derived from a
Canvas or parent Frame. They are not reserved global tokens.

## 5. IntrinsicExtent

`IntrinsicExtent` is the minimal generic fact needed to preserve content shape:

```ts
type IntrinsicExtent = {
  readonly contract: "svml.intrinsic-extent@1";
  readonly widthPx: number;
  readonly heightPx: number;
};
```

The values are the content's positive display-oriented natural pixel extent. Their ratio is all that
`contain`, `cover`, `fit-width`, `fit-height` and `stretch` need; `native` and `scale-down` also use
their absolute relation to Canvas pixels. Media may derive them after applying container rotation
and sample-aspect information. Text may derive them from exact font shaping. A vector component
must choose an explicit nominal raster extent rather than pretending arbitrary view-box units are
Canvas pixels. None stores the source Artifact, font, component family or upstream digest inside
`IntrinsicExtent`; those relationships remain visible on graph edges and Derivations.

## 6. ContentFit and the two-frame equations

`ContentFit` chooses sizing, alignment and an optional alignment constraint:

```ts
type ContentFit = {
  readonly contract: "svml.content-fit@1";
  readonly sizing:
    | "contain"
    | "cover"
    | "fit-width"
    | "fit-height"
    | "native"
    | "scale-down"
    | "stretch";
  readonly framePoint: { readonly x: number; readonly y: number };
  readonly contentPoint: { readonly x: number; readonly y: number };
  readonly offsetPx: { readonly x: number; readonly y: number };
  readonly constraint: "bounded" | "free";
};
```

Points are normalized in their own Frames. `framePoint` says where in the Placement Frame the
chosen content point wants to land. `contentPoint` says which intrinsic source point is important.
This is more expressive than the old single `focalX/focalY`, which silently used the same coordinate
on both sides. Both point coordinates must lie in `[0,1]`; deliberate displacement beyond those
bounds uses `offsetPx` and, when it must remain out of bounds, `constraint="free"`.

Given Placement Frame `(Vx, Vy, Vw, Vh)` and intrinsic extent `(Sw, Sh)`, the aspect-preserving
base scales are:

```text
contain      min(Vw / Sw, Vh / Sh)
cover        max(Vw / Sw, Vh / Sh)
fit-width    Vw / Sw
fit-height   Vh / Sh
native       1
scale-down   min(1, contain-scale)
```

For these modes:

```text
Cw = Sw × scale
Ch = Sh × scale
```

`stretch` deliberately abandons source aspect and produces `(Cw, Ch) = (Vw, Vh)`. It is explicit
because mature editors permit distortion; no other sizing mode may distort.

Before constraint:

```text
Cx = Vx + Vw × framePoint.x - Cw × contentPoint.x + offset.x
Cy = Vy + Vh × framePoint.y - Ch × contentPoint.y + offset.y
```

For `free`, these coordinates are final. For `bounded`, each axis is minimally clamped by one law:

- when content is smaller, keep the complete Content Frame inside the Placement Frame;
- when content is larger, keep the complete Placement Frame covered by the Content Frame.

For the horizontal axis this means:

```text
Cw <= Vw: clamp Cx to [Vx,           Vx + Vw - Cw]
Cw >= Vw: clamp Cx to [Vx + Vw - Cw, Vx          ]
```

The vertical law is identical. This supports true focal placement such as “source point `(0.8,
0.35)` should appear at the center of the Frame” without permitting an accidental uncovered strip.

The usual nine alignments are shorthand where `framePoint === contentPoint`. Centered contain and
centered cover are both `(0.5, 0.5)` on each side. `top-left` is `(0,0)` on each side. An author who
needs the content deliberately outside or the Placement Frame deliberately uncovered chooses
`free`; the Runtime never makes that creative decision.

`FittedContent` contains the derived Content Frame and no duplicated upstream lineage:

```ts
type FittedContent = {
  readonly contract: "svml.fitted-content@1";
  readonly contentFrame: SpatialFrame;
};
```

When clipping to the Placement Frame, the corresponding source sampling window is mechanically
derived from the intersection of Placement and Content Frames. It is not a third authored box. A
post-fit rotation or perspective transform may make the sampling boundary non-rectangular and is
therefore applied after this base layout.

## 7. Fit is not motion and not occupancy

A fit calculation produces the base Content Frame. Zoom, pan, rotation, perspective and entrance
motion transform that result later. They do not mutate the `ContentFit` or source aspect.

This prevents the old ambiguity where `zoom` was embedded inside `contain`/`cover` and could quietly
invalidate the claimed fit. If a Ken Burns motion zooms a contained image until it crops, the base
fit remains `contain` and the later transform explicitly creates the crop.

Spatial sizing is also unrelated to intrinsic temporal occupancy. A video may be `contain` in space
while it plays once, loops or stretches in time. The same image has no intrinsic temporal playback
mode merely because it has an intrinsic spatial extent.

## 8. Clipping and frame shape

Spatial geometry never decides whether pixels outside a Placement Frame are visible. The consuming
component owns an explicit clip policy:

```text
none                 owned content may paint outside the Placement Frame
placement-frame      rectangular or rounded Frame clip
owned-shape          explicit shape/path owned by the same component
```

Corner radius, ellipse/path masks, border and shadow are presentation, not coordinates. A Text
glow may legitimately overflow its Placement Frame; a Media card normally clips every local sample
to the same rounded Placement Frame. No default is inferred from content type by Runtime.

An owned shape may clip only elements in the same component contribution. It cannot mask or sample
a sibling Track.

## 9. Transparent, solid, blurred and alternate backings

The area of a Placement Frame not painted by a Content Frame is not itself spatial meaning.
Media/Text presentation supplies an ordered list of explicit owned layers.

### Transparent

No backing layer is emitted. Transparent pixels naturally reveal lower Tracks during Composition.
This is not cross-Track sampling: the Track contributes no pixel there.

### Solid or gradient

A frame Paint layer fills the Placement Frame. It has no source input, IntrinsicExtent or Content
Frame.

### Blurred copy of the same source

The source is connected explicitly a second time as another local sample:

```text
same source Artifact ─┬─> cover ContentFit -> blur/tone -> backing layer
                      └─> contain ContentFit            -> foreground layer
```

Both samples share one Placement Frame but have independent Content Frames and effects. Artifact
collection deduplicates identical bytes; rendering still performs two explicit samples. The blur
implementation must edge-extend/overscan before clipping so the Gaussian kernel cannot create an
unintended transparent or dark border.

### Another image or video

The alternate source enters on its own graph edge and receives its own Inspection, IntrinsicExtent,
ContentFit and, for timed media, occupancy. It is not a string path hidden in a Style Recipe.

The general Media author model is therefore ordered local layers rather than special
`foreground/background` fields:

```svml
<media:Item id="portrait-card" frame={card} clip={rounded-card}>
  <media:Paint recipe={studio.media.card-base}/>
  <media:Layer source={portrait} fit={cover} effects={blurred}/>
  <media:Layer source={portrait} fit={contain}/>
</media:Item>
```

Changing the second source to another image expresses an alternate backing. Removing the first two
children expresses transparent backing. Each layer may lower to its own absolute-stack Present when
peer Track interleaving is required; an authoring Track never becomes an implicit stacking context.

The complete Item/Sequence author model is specified in [`media-track.md`](./media-track.md). The
independent depth-stack collection model is specified in [`deck-track.md`](./deck-track.md). Both
reuse the explicit layer and edge laws without making Deck a Media mode.

### What remains forbidden

`backdrop-filter` over the already accumulated Composition is not one of these cases. It would make
the result depend on arbitrary lower Tracks. To blur another visual, the component must receive
that visual/media explicitly. To blur a completed lower composite, a higher-order component must
explicitly own and materialize that composite first.

## 10. Text, Ranking and Caption use

Spatial provides common geometry without forcing one layout model:

- Point Text consumes a `SpatialPoint` and derives its Content Frame from exact text extent;
- Area Text consumes a Placement Frame, then performs package-owned paragraph flow inside it;
- Path Text consumes an explicit `SpatialPath`;
- Media consumes a Placement Frame and derives one Content Frame per sample;
- Ranking consumes Frames/Points for its board, slots and staging areas, then owns sibling layout;
- Comment Sticker consumes a Placement Frame and owns its avatar/text/internal layout;
- Caption may consume a Placement Frame, but Cue/Atom wrapping remains Caption-owned.

Text's layout box and Media's Content Frame are not the same semantic Type merely because both are
rectangles. They may use the same pure geometry helpers while remaining package-owned resolved
facts.

## 11. Graph dataflow and no metadata propagation

```text
CanvasSpace + Frame Projection
              │
              ▼
         SpatialFrame ───────────────────────────────┐
                                                     │
Media Inspection -> display extent -> IntrinsicExtent│
                                                     ├─> fit -> FittedContent
authored ContentFit ─────────────────────────────────┘          │
                                                                ▼
                               package Paint/motion/clip -> VisualTrack
```

Every dependency is a graph edge. `MediaArtifactRef` does not gain placement fields. `SpatialFrame`
does not gain source, role, timing or Artifact digests. `VisualTrack` does not gain `focal`, B-roll
or Text fields. Affinity is validated by the multi-input fitting/lowering Operation rather than by
copying lineage metadata through every value.

## 12. Twinit findings retained and retired

Retained:

- normalized author placement and source-aspect-aware anchored placement;
- independent source fitting and temporal occupancy;
- contain, cover, fit-width and fit-height equations;
- independent foreground and backing sampling;
- source focal alignment and explicit attachment points;
- optional transparent, solid and self-blurred backings;
- local motion over sampling/placement.

Retired:

- `SpaceLocator` as a union mixing regions, VLM inference, avoidance, path signals and fixed boxes;
- nine-grid codes as separate algorithms;
- one `focalX/focalY` reused as both source and target point;
- `MediaBoxStyle` treating exactly one foreground and one special backing as the universal model;
- embedding zoom into fit;
- renderer-specific CSS and FFmpeg formulas as two sources of truth;
- hidden `object-fit`, `object-position` or `backdrop-filter` defaults.

## 13. Implementation and acceptance order

1. **Implemented:** add the focused `@narratage/spatial` package with `CanvasSpace`, Frame/Point/Path,
   `IntrinsicExtent`, `ContentFit` and pure fit validation;
2. **Implemented:** split Canvas declaration from Film assembly and connect the same Canvas value to Track layout and
   Composition;
3. **Implemented:** migrate one simple Text Area and one simple Media still image through shared geometry;
4. add exact browser tests for every fit and alignment law;
5. prove ordered transparent/color/self-blur/alternate-source Media layers;
6. migrate Ranking and Comment Sticker geometry;
7. only then freeze the Spatial Types and related Visual IR behavior.

The test matrix must include:

- portrait, landscape and square intrinsic extents against portrait, landscape and square Frames;
- every sizing mode, including explicit distortion and scale-down;
- all nine equal-point alignments plus unequal source/frame focal points;
- bounded versus free alignment;
- negative/partially/fully off-canvas Placement and Content Frames;
- parent Frame percentages and pixel offsets;
- source rotation/sample-aspect normalized before Spatial;
- transparent, solid, same-source blur and alternate image/video layers;
- independent backing and foreground Content Frames;
- rounding/raster behavior locked by the selected renderer implementation;
- no Core, Runtime, Film-family, Text-family or Media-family discriminator in the shared Types.

Until those witnesses pass, percentages embedded independently in Text, B-roll and Caption remain
migration scaffolding rather than the shared spatial system.
