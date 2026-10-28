# `@hypit/visual-track`

Visual Track is the plain picture-placement package. Its author model is deliberately small:

```text
Visual Clip = one picture source + absolute Window + Frame
            + spatial map + optional temporal Map/Curve + optional treatment + optional typed Motion
Transition = two adjacent, overlapping Visual Clips + a package-owned effect
Visual Track = ordered Clips + explicit Transition relations
```

That model is owned by the package's syntax-neutral Author declarations. They define Clip source
selection, typed references, `Map`/`Sampling`/`Pose` children, Records and graph lowering without
receiving a Markup syntax tree. SVML contributes only the `Track` and `Motion` spellings. Temporal relation literals are parsed by
Temporal's value-level API, while this package decides where those relations are used.

The Track consumes one completed Timeline. It publishes `.program` for
declared tooling and `.visual` for Film. It does not discover media or anchors from Timeline, infer
semantic roles, select audio, or derive Transition participants from timing proximity.

```svml
<import as="transition" from="@hypit/visual-transition@1"/>

<visual:Motion id="gentle-push">
  <visual:Pose at="start" scale="1.08" easing="ease-out"/>
  <visual:Pose at="end" scale="1"/>
</visual:Motion>

<transition:CrossDissolve id="soft-mix" easing="ease-in-out"/>

<visual:Track id="picture" timeline={program.timeline}>
  <visual:Clip id="speaker" media={speaker-media.media}
    during={program.speaker} frame={full-frame} fit="cover"/>
  <visual:Clip id="diagram" image={diagram} extent={diagram-extent}
    during={explanation} frame={inset-frame} fit="contain"
    treatment={recipes.visual.diagram} motion={gentle-push}/>
  <visual:Transition id="speaker-to-diagram"
    outgoing="speaker" incoming="diagram" effect={soft-mix}/>
</visual:Track>
```

A public Clip accepts exactly one direct source form—`image` plus `extent`, prepared `media`, or a
typed `surface`. Moving media is prepared before authoring; its exact local domain and map to source
presentation time remain source truth. The destination Window states when this
occurrence exists in program time.

The package's TypeScript component API also exposes an ordered `MediaLayerSet`. It is the lower-level
material construction used when one authored visual role needs a paint backing, a repeated self-blur,
or another explicit multi-sample relationship before it becomes one Clip Present. This does not make
the `<visual:Clip>` declaration a multi-source guessing interface: its direct author syntax still has exactly
one selected source, while a project component that owns shared multi-sample behavior constructs the
layers deliberately.

The ordinary source roles are intentionally equal. A-roll, B-roll, generated footage and imported
graphics are all Clips. A source may have contributed duration and anchors while Timeline was built;
that prior contribution does not give its later visual occurrence a special Type or placement route.

## Frame and source mapping

`frame` is the outer destination rectangle. Independent Clip attributes control placement and
temporal sampling; an optional treatment Recipe contains only reusable pixel and Frame treatment:

| Properties | Meaning |
| --- | --- |
| `fit`, alignment, offsets and constraint | Convenient occurrence attributes that derive one source-to-picture `SpatialMap2D`. |
| `mapping` | An explicit `SpatialMap2D` used instead of all fit attributes. |
| `clip`, `radius`, `padding` | Outer geometry and the fitting inset. |
| border, shadows and `frame-paint` | Decoration owned by this Clip. |
| opacity, blur, brightness, contrast, saturation | Treatment of the sampled picture. |
| `Map` / `Curve` child | Optional Clip-local relation from target-local time to prepared-media-local time. |

Clip declaration order is retained as the Track-local item sequence. Whole-film placement belongs to the
parent `<film:Track id="...">` relation, not to a Clip or its reusable treatment Recipe. This lets
the same VisualTrack be placed in another Film or nested Stack without rewriting its contents.

An authored spatial Path may replace the treatment clip with `clip={path}`. Path coordinates remain
in program-picture pixels. A typed `Motion` transforms the whole framed Clip with affine/opacity
`Pose` keyframes; inline `Pose` children express the same value. `Sampling` children animate the
fitted source inside the Frame. Neither form names a closed aesthetic effect.

The resolved Program never retains fit as a competing spatial authority. When the Clip Frame is
known, ordinary fit resolves once against the Frame's deterministic border/padding inset; an
explicit mapping passes through unchanged. Every sample in `.program` then carries the final
`SpatialMap2D`, and rendering applies that complete matrix to the source-local extent. A rectangular
content bound may be derived for diagnostics, but is not stored or rendered as a substitute for the
map.

For the open path, publish or receive a map and share the same value with every consumer that needs
the identical projection:

```svml
<space:Map id="turned" xx="0" xy="-0.5" yx="0.5" yy="0" tx="920" ty="180"/>
<visual:Clip image={diagram} extent={diagram-extent} mapping={turned}
  during={explanation} frame={inset-frame}/>
```

The explicit map is already in program-picture coordinates. `frame` still independently owns the
Clip's clipping and treatment boundary. This separation permits rotation, skew, reflection,
off-Frame placement and exact reuse by source-local evidence without adding a layout mode.

## Temporal sampling

Omitting a Map means bounded partial identity: Clip-local time zero maps to prepared-media-local time
zero, and the picture becomes absent when either finite domain ends. There is no implicit hold, loop
or stretch.

One `Map` states an affine piece. `target-from`/`target-until` bound its target interval;
`target-at`, `source-at` and the exact rational `rate` relate the two clocks;
`source-from`/`source-until` bound the source domain. `wrap-from`/`wrap-until` make that source interval
periodic. A Map without rate, anchors or wrap fits the selected source interval across its target
interval. Multiple non-overlapping Maps form one partial function; uncovered target time is
transparent.

One `Curve` states a monotone cubic source-position piece. Target position is the linear parameter;
`source-at-start`, `source-control-1`, `source-control-2` and `source-at-end` are exact positions in
the prepared-media domain. This describes the position relation itself, so frame blending, optical
flow and other reconstruction policies do not enter the Track value.

```svml
<visual:Clip media={shot.media} during={story.outro} frame={full}>
  <visual:Map target-at="end" source-at="end" rate="1"/>
</visual:Clip>

<visual:Clip media={shot.media} during={story.ramp} frame={full}>
  <visual:Curve source-at-start="start" source-control-1="start+250ms"
    source-control-2="end-250ms" source-at-end="end"/>
</visual:Clip>
```

The relation stays exact in Composition and `HtmlProgram`. Only the selected renderer resolves it against decoded source samples.
Source media may use a different or variable frame cadence from the Timeline; that cadence is a source fact, not a second programme clock. Visual rates may be zero for a hold or negative for reverse
traversal. A still image has no temporal domain and refuses Map; it simply remains visually active throughout the Clip Window while
Clip-local Motion may still animate it.

## Transitions

`Transition` is a relation between two existing Clip occurrences, not a third picture source.
`outgoing` and `incoming` name the participants explicitly, and `effect` references a separately
authored `VisualTransitionEffect`. The two Clips must overlap and be neighbours in Track paint order,
with the outgoing Clip starting and ending first. Their complete intersection is the Transition span;
authors do not repeat that fact as a `during` Window. There are no hidden handles, freeze frames,
repeated samples or inferred edit points. The Program retains only the relation; projection and
Studio derive the intersection from the participant Windows instead of caching a second span fact.

```svml
<transition:CrossDissolve id="soft-mix" easing="ease-in-out"/>

<visual:Track id="sequence" timeline={program.timeline}>
  <visual:Clip id="wide" media={wide.media} during={wide-window} frame={full} fit="cover"/>
  <visual:Clip id="close" media={close.media} during={close-window} frame={full} fit="cover"/>
  <visual:Transition id="wide-to-close"
    outgoing="wide" incoming="close" effect={soft-mix}/>
</visual:Track>
```

Each Clip keeps evaluating its own temporal Map during the overlap. Projection supplies both Presents
as independently timed inputs to a generic Composition `VisualProcess`; the effect package decides how
they combine. Visual Track knows no transition catalogue. Studio shows the relation on an attached
Transitions lane and follows `effect` to that package's parameter companion.

`@hypit/visual-transition` supplies the official Dissolve, Dip, Push, Slide, Wipe, Iris, Zoom Dissolve
and Blur Dissolve effects. Other packages can publish the same `VisualTransitionEffect` Type without
changing this package, Composition or Film.

Visual Track still contains no generic `Presentation`, `Use`, `Sequence` or inferred `Handoff`.
Multi-shot choreography, slideshows, shared masks and coordinated visual/audio behavior remain
ordinary project/author components that publish the same terminal `VisualTrack`.

This is the package's incremental boundary: the plain Clip supplies the stable operations almost
every picture occurrence needs, while a new visual role remains straightforward to author as a
component. The Track does not force authors to start from raw Composition IR, and it does not turn
today's effect names into tomorrow's ceiling.

Audio from prepared media is never selected implicitly. Author the corresponding occurrence
independently through [`@hypit/audio-track`](../audio-track/README.md).

## Distribution and Studio

Visual Track is an official default Author Package, not a Core or terminal-ABI package. The Hypit
video Distribution obtains it through an ordinary npm dependency so a default installation can use
it immediately, while its code, version and activation remain owned by `@hypit/visual-track`.
Projects select it explicitly with the logical `@hypit/visual-track@1` Module ABI. Package managers
and the project lockfile select the physical implementation version.

The stable terminal [`VisualTrack`](../composition/README.md) type is owned by Composition. Visual
Track is one plain producer of that type; another project or published component may produce the same
terminal value without depending on this package.

The package's activation contributes both its author declarations and its Studio Companion. The
Companion preserves Clip material, Frame, fit, treatment and typed Motion as separate
author facts, and presents Cross Dissolve relations in their own attached lane. Studio's generic terminal fallback can still display a Composition `VisualTrack` made
by another package without interpreting it as a Visual Track Clip.
