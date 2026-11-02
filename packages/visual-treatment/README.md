# `@hypit/visual-treatment`

`@hypit/visual-treatment` supplies reusable one-input Picture effects for Visual Adjustment
occurrences. `@hypit/visual-adjustment` owns occurrence identity, resolved time and Scope placement;
this package owns only how the accumulated Picture is transformed.

```xml
<import as="adjust" from="@hypit/visual-adjustment@1"/>
<import as="treatment" from="@hypit/visual-treatment@1"/>

<treatment:Color id="cinematic" contrast="1.08" saturation="0.9" hue="-2"/>

<adjust:Track id="look" timeline={story.timeline}>
  <adjust:Adjustment id="cinematic" during={story.body} effect={cinematic}/>
</adjust:Track>
```

## Official effects

| Declaration | Picture operation | Parameters |
| --- | --- | --- |
| `Transform` | affine placement | `x`, `y`, `scale` or `scale-x`/`scale-y`, `rotate`, `origin-x`, `origin-y` |
| `Opacity` | alpha multiplication | `value` |
| `Blur` | Gaussian blur | `radius` |
| `Color` | one ordered browser-sRGB color operation | `brightness`, `contrast`, `saturation`, `hue`, `grayscale`, `sepia`, `invert` |

One top-level parameter set makes a static effect. Two or more complete `Keyframe` children make an
effect vary over the owning Adjustment occurrence. Keyframe positions are `start`, `end`, or a
percentage; optional easing is `linear`, `ease-in`, `ease-out`, or `ease-in-out`.

```xml
<treatment:Blur id="focus-pulse">
  <treatment:Keyframe at="start" radius="0" easing="ease-in-out"/>
  <treatment:Keyframe at="50%" radius="24" easing="ease-in-out"/>
  <treatment:Keyframe at="end" radius="0"/>
</treatment:Blur>
```

All declarations produce the public `VisualAdjustmentEffect` Type. Visual Adjustment does not
enumerate them, and project or ecosystem packages can publish other effects through the same Type.
Separate Adjustment occurrences make effect order explicit; `Color` alone defines one stable order
for the parameters that are jointly one color operation.

Each declaration also exports `id.process`, a `Composition.VisualProcessEffect` with one
`content` input. A Visual Track Clip or Film Compound can apply ordered `Effect` children:

```xml
<treatment:Color id="grade" contrast="1.1" saturation="0.9"/>
<treatment:Blur id="soft" radius="4"/>
<!-- Within a Clip or Compound -->
<Effect source={grade.process}/>
<Effect source={soft.process} enabled="true"/>
```

`enabled` defaults to `true`. A process applies to its complete input picture. Ordering follows
child declaration order. The treatment's keyframes use the owning occurrence clock.
