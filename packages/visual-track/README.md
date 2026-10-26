# `@hypit/visual-track`

Visual Track is the plain picture-placement package. Its author model is deliberately small:

```text
Visual Clip = one picture source + absolute Window + Frame
            + spatial map + optional temporal Map + optional treatment + optional typed Motion
Visual Track = ordered set of Visual Clips
```

The Track consumes one completed Timeline. It publishes `.program` for
declared tooling and `.visual` for Film. It does not discover media or anchors from Timeline, infer
semantic roles, select audio, or own multi-Clip transitions.

```svml
<visual:Motion id="gentle-push">
  <visual:Pose at="start" scale="1.08" easing="ease-out"/>
  <visual:Pose at="end" scale="1"/>
</visual:Motion>

<visual:Track id="picture" timeline={program.timeline}>
  <visual:Clip id="speaker" media={speaker-media.media}
    during={program.speaker} frame={full-frame} fit="cover"/>
  <visual:Clip id="diagram" image={diagram} extent={diagram-extent}
    during={explanation} frame={inset-frame} fit="contain"
    treatment={recipes.visual.diagram} motion={gentle-push}/>
</visual:Track>
```

A public Clip accepts exactly one direct source form—`image` plus `extent`, prepared `media`, or a
typed `surface`. Moving media is prepared before authoring; its exact local domain and map to source
presentation time remain source truth. The destination Window states when this
occurrence exists in program time.

The package's TypeScript component API also exposes an ordered `MediaLayerSet`. It is the lower-level
material construction used when one authored visual role needs a paint backing, a repeated self-blur,
or another explicit multi-sample relationship before it becomes one Clip Present. This does not make
the `<visual:Clip>` Surface a multi-source guessing interface: its direct author syntax still has exactly
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
| `Map` child | Optional Clip-local relation from target-local time to prepared-media-local time. |

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

```svml
<visual:Clip media={shot.media} during={story.outro} frame={full}>
  <visual:Map target-at="end" source-at="end" rate="1"/>
</visual:Clip>
```

The relation stays exact in Composition and `HtmlProgram`. Only the selected renderer resolves it against decoded source samples.
Source media may use a different or variable frame cadence from the Timeline; that cadence is a source fact, not a second programme clock. Visual rates may be zero for a hold or negative for reverse
traversal. A still image has no temporal domain and refuses Map; it simply remains visually active throughout the Clip Window while
Clip-local Motion may still animate it.

Visual Track contains no generic `Presentation`, `Use`, `Sequence` or `Handoff`. A continuing
presenter, crossfade, slideshow or coordinated reveal is shared behavior and therefore belongs to an
ordinary project/author component. Such a component may use the public visual primitives and still
publish the same terminal `VisualTrack`; Core and Film learn no new role.

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

The package's activation contributes both its authoring Surfaces and its Studio Companion. The
Companion preserves Clip material, Frame, fit, treatment and typed Motion as separate
author facts. Studio's generic terminal fallback can still display a Composition `VisualTrack` made
by another package without interpreting it as a Visual Track Clip.
