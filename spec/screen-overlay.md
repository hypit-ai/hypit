# SVML Screen Overlay Authoring

Status: design authority for the optional official Screen Overlay package. It is not implemented by
an author Surface yet and is not a frozen public ABI.

## Purpose

`@narratage/screen-overlay` contributes self-contained, usually full-canvas pixels over an authored
time window. A flash, vignette, scan-line veil or deterministic light leak is an ordinary
`VisualTrack`, exactly like Text, Caption, Media or Ranking.

It is not an adjustment layer, a privileged post-composition hook, a transition engine or a way to
read the pixels of lower Tracks.

```text
Moment / Selection / Program ─> shared temporal projection ─┐
CanvasSpace ────────────────────────────────────────────────┼─> Overlay Program
effect parameters / explicit owned assets ─────────────────┘          │
                                                                      ▼
                                                Visual IR elements or owned Surface
                                                                      │
                                                                      ▼
                                                                 VisualTrack
```

Core, Runtime and Composition do not know Screen Overlay. Composition only validates and orders its
self-contained Presents.

## 1. The self-contained-pixel law

Every overlay item must be renderable from:

- its own authored parameters;
- the explicitly connected CanvasSpace and ProgramSpace;
- zero or more explicit assets owned by that item;
- its deterministic local frame number.

It must not sample:

- the accumulated Composition below it;
- a sibling Track;
- a hidden Base Track;
- the previous or next scene;
- a browser backdrop or environment texture.

Normal source-over alpha compositing is allowed: that is how every alpha-bearing Track reaches the
canvas. Blend modes or filters whose result depends on unknown lower pixels are not self-contained.

This law means the old source-free `backdrop-filter` implementations of Gaussian Blur, Color
Adjust and Zoom Blur are not Screen Overlays. To preserve those effects honestly, a media-effect
component must receive the exact media or compositable Surface to transform through a graph edge,
then output its own transformed material or Track. If a future component explicitly rasterizes a
selected group of Tracks into a Surface, consuming that Surface is also explicit; Screen Overlay
never gains a secret “current frame” input.

## 2. Author package, not operator registry

The official package may expose several readable author components under one namespace:

```xml
<screen:Track id="screen-paint">
  <screen:Flash at={story.moment.hit} for="240ms" color="#ffffff" intensity={0.9}/>
  <screen:Vignette during={program} opacity={0.28}/>
  <screen:Grain during={program} amount={0.12} seed={23}/>
</screen:Track>
```

This is illustrative Surface syntax. The compiled Program contains explicit component identity,
parameters and temporal binding; it is not one stringly typed `effect="..."` switch owned by Core.

One package is convenient for the small official collection, but it is not a central registry. A
third party may publish another self-described package that lowers a new component to the same
Visual Track waist. Adding an overlay must not require changing Core, Film, Composition or
HyperFrames when existing Visual IR or a typed Surface can express it.

Appearance defaults and named combinations belong in `.svs` recipes. The package owns parameter
validation and deterministic lowering. Runtime Profiles and Providers do not choose a visual
effect.

## 3. Program axes

Every overlay item has four independent author concerns:

```ts
type ScreenOverlayItemProgram = {
  readonly id: string;
  readonly content: ScreenOverlayComponent;
  readonly temporal: TemporalBinding;
  readonly presentation: ScreenOverlayPresentation;
  readonly stacking: AbsoluteStackingIntent;
};
```

- `content` identifies the actual visual component and its typed parameters;
- `temporal` uses the shared Selection/Moment/Program projection algebra;
- `presentation` describes the item's within-window envelope or local motion;
- `stacking` resolves to an ordinary absolute Present stacking key.

Canvas geometry is not an author-selected Spatial Frame here. A Screen Overlay intentionally owns
the complete connected CanvasSpace. A partial-frame light, image, card or blur is a normal Media,
Text or component Track and uses [`spatial-layout.md`](./spatial-layout.md).

Items are independent by default. Overlap is valid and produces multiple ordinary Presents. There
is no singleton Screen Overlay lane and no global merge step.

## 4. Timing and local envelopes

Selection, Moment, Program and absolute timing lower through
[`track-authoring.md`](./track-authoring.md). Screen Overlay does not have `from`, `until`, `manual`
or phrase-matching timing laws of its own.

The projected window answers only where the item exists. Its within-window envelope is component
presentation. For example, a Flash may define attack, peak and decay; a Directional Matte may move
an edge from one side to another; Grain may remain steady. The old universal triangle that peaked
at 30% of every effect's duration is retired as hidden presentation policy.

Recipe defaults may supply an envelope, but the resolved Program must contain the exact parameters.
An effect cannot expand its projected window to fit an animation. Invalid or zero-length windows
fail through the common temporal validator.

## 5. Portable official component set

The useful old effects divide into two honest lowering groups.

### Direct Visual IR candidates

These can normally lower to full-canvas boxes, gradients and local keyframes:

- `Flash` — solid color with an explicit opacity envelope;
- `ColorWash` — source-over color veil; no hidden lower-pixel blend mode;
- `Vignette` — authored center, radius, softness, roundness, color and opacity;
- `ScanLines` — spacing, thickness, angle, opacity and local motion;
- `DirectionalMatte` — angle, coverage, feather, color, opacity and progress;
- `WhipVeil` — direction, width, softness, travel and opacity;
- `GlitchVeil` — deterministic owned color bars/washes, not displacement of lower pixels.

### Owned Surface candidates

These may be easier or more exact as deterministic alpha-bearing `CompositableSurface` values:

- `Grain` — amount, grain size, monochrome/color, motion rate and required seed;
- `LightLeak` — colors, angle, softness, travel, intensity and seed when stochastic;
- `Bokeh` — amount, size range, color/warmth, drift and required seed;
- `TVStatic` — amount, noise size, scan-line contribution, motion rate and required seed.

Choosing Visual IR or Surface is a lowerer implementation decision only when both produce the exact
declared pixels. It cannot depend on which Runtime happens to execute the Build. A materializing
implementation may issue an ordinary Provider Need, but the Need returns a typed owned Surface and
does not receive the lower composite.

All stochastic behavior requires an explicit resolved seed. `Math.random()`, wall time, GPU noise
or renderer-dependent entropy is invalid.

## 6. Explicitly excluded effects

The following old names are excluded from the source-free package:

| Old effect | Why excluded | Honest replacement |
|---|---|---|
| `gaussian_blur` | must read pixels being blurred | media/surface filter with explicit input |
| `color_adjust` | exposure/contrast/saturation/hue alter input pixels | media/surface color transform with explicit input |
| `zoom_blur` | a real radial blur requires the visual being sampled | media/surface effect with explicit input |
| screen/multiply/overlay blend wash | result depends on lower pixels | source-over alpha approximation, or explicit-input materialization |

This does not delete the visual result. It rejects the old privilege by which a supposedly ordinary
Track could mutate everything beneath it.

Screen Overlay also cannot:

- change Program duration or playback rate;
- own the cut between adjacent media items;
- transition two sibling Tracks;
- reserve a topmost z-index;
- hide a sound effect inside a visual item.

A visually masked hard cut remains two independent facts: the Media package owns the cut and the
Screen Overlay happens to cover some of the same frames. A combined authored `Impact` Fragment may
produce one Visual Track and one Audio Track from the same Moment, but both outputs remain explicit
peer edges into Film.

## 7. Stacking

The old fixed `z_index: 200` rule is retired. “Screen” describes full-canvas geometry, not a magical
render phase. Every Present receives an explicit absolute stacking intent and Composition flattens
it with all other Presents.

An author can intentionally put a vignette below captions, a flash above captions or grain between
two graphic layers. Package recipes may provide convenient stacking defaults, but Film and
Composition never switch on the package family and never force it to the top.

If one overlay package emits multiple Presents at different stacking positions, peer Tracks may
interleave between them exactly as required by the flat Track law.

## 8. Twinit migration audit

Retain:

- short Moment hits and long Program overlays;
- Selection, Moment and absolute temporal placement;
- full-canvas flash, veil, vignette, light leak, grain, scan lines, bokeh and static visuals;
- deterministic effect-specific parameters and local envelopes;
- several simultaneous effects;
- optional explicit owned textures or materialized alpha Surfaces.

Retire:

- singleton slot semantics;
- fixed topmost z-index and special post-caption render phase;
- one central string operator registry as system truth;
- the universal 30%-peak envelope;
- hidden `backdrop-filter` access;
- `mix-blend-mode` across Tracks;
- pretending screen hits are scene transitions;
- hidden lane-level enter/exit SFX;
- any Base FX counterpart or placeholder.

## 9. Lowering and acceptance

Implementation should follow the shared Temporal and existing Visual Track contracts:

1. add the self-described `@narratage/screen-overlay` author package;
2. implement separate typed author components rather than one unvalidated parameter bag;
3. lower simple components to `svml.visual-ir@1` and complex ones to typed owned Surfaces;
4. use the connected CanvasSpace and ProgramSpace, never Film globals;
5. emit ordinary absolute-stack Presents;
6. add deterministic frame tests for every component and envelope;
7. prove identical pixels across local and parallel frame rendering;
8. prove multiple overlay Tracks interleave with Text/Caption/Media by stacking key;
9. add negative tests rejecting any lower-composite, sibling-Track, backdrop-filter or hidden audio
   dependency.

The design fails if installing a new overlay requires a Core branch, a Composition family, a
HyperFrames component switch or an implicit snapshot of already composed pixels.

