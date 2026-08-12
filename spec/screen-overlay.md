# SVML Screen Overlay Authoring

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

This law means source-free `backdrop-filter` implementations of Gaussian Blur, Color Adjust and
Zoom Blur are not Screen Overlays. To preserve those effects honestly, a media-effect
component must receive the exact media or compositable Surface to transform through a graph edge,
then output its own transformed material or Track. If a future component explicitly rasterizes a
selected group of Tracks into a Surface, consuming that Surface is also explicit; Screen Overlay
never gains a secret “current frame” input.

## 2. Author package, not operator registry

The official package may expose several readable author components under one namespace:

```xml
<screen:Track id="screen-paint" canvas={vertical} space={speech.space}>
  <screen:Flash at={story.moment.hit} map={timing.map} for="240ms" z="90"
    color="#ffffff" intensity="0.9" attack="2" hold="3" decay="5"/>
  <screen:Vignette during="program" z="20"
    center-x="0.5" center-y="0.5" radius-x="0.82" radius-y="0.68"
    softness="0.3" color="#000000" opacity="0.28"/>
  <screen:Grain during="program" z="70"
    amount="0.12" size="3" chroma="monochrome" motion-rate="0.5" seed="23"/>
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
type ScreenOverlayItemSpec = {
  readonly id: string;
  readonly content: ScreenOverlayComponent;
  readonly projection: TemporalWindowProjection;
  readonly expansion: OccurrenceExpansion;
  readonly stackingOrder: number;
};
```

- `content` identifies the actual visual component and its typed parameters;
- component-owned envelope and local-motion parameters remain inside that typed component rather
  than a universal presentation bag;
- `projection` and `expansion` use the shared Selection/Moment/Program algebra;
- `stackingOrder` resolves with stable authored identity to an ordinary absolute Present key.

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

Recipes may supply an envelope, but the resolved Program must contain the exact parameters.
An effect cannot expand its projected window to fit an animation. A longer authored envelope is
simply clipped by that window; it is not rejected or secretly sped up. Invalid or zero-length
windows still fail through the common temporal validator.

## 5. Portable official component set

The supported effects divide into two lowering groups.

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

These may be easier or more exact as deterministic alpha-bearing `CompositableSurface` values, but
the current official implementations fit exactly in the closed code-free Visual IR:

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

The following effects are excluded from the source-free package:

| Effect | Why excluded | Honest replacement |
|---|---|---|
| `gaussian_blur` | must read pixels being blurred | media/surface filter with explicit input |
| `color_adjust` | exposure/contrast/saturation/hue alter input pixels | media/surface color transform with explicit input |
| `zoom_blur` | a real radial blur requires the visual being sampled | media/surface effect with explicit input |
| screen/multiply/overlay blend wash | result depends on lower pixels | source-over alpha approximation, or explicit-input materialization |

This does not forbid the visual result. It rejects the privilege by which a supposedly ordinary
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

“Screen” describes full-canvas geometry, not a magical
render phase. Every Present receives an explicit absolute stacking intent and Composition flattens
it with all other Presents.

An author can intentionally put a vignette below captions, a flash above captions or grain between
two graphic layers. Package recipes may provide convenient stacking defaults, but Film and
Composition never switch on the package family and never force it to the top.

If one overlay package emits multiple Presents at different stacking positions, peer Tracks may
interleave between them exactly as required by the flat Track law.
