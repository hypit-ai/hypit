# @hypit/visual-transition

`@hypit/visual-transition` supplies reusable two-input effects for explicit Visual Transition
relations. `@hypit/visual-track` owns the relation between adjacent Clip occurrences and derives its
span from their exact overlap; this package owns only how the two resulting Pictures combine.

```xml
<import as="transition" from="@hypit/visual-transition@1"/>

<transition:CrossDissolve id="soft-mix" easing="ease-in-out"/>

<visual:Transition id="handoff"
  outgoing="wide" incoming="close" effect={soft-mix}/>
```

Both Clips must be adjacent in paint order and overlap. Their complete overlap is the Transition
interval; authors do not repeat it as another Window. A direct cut needs no Transition declaration.

## Official effects

| Declaration | Picture operation | Parameters |
| --- | --- | --- |
| `CrossDissolve` | complementary premultiplied-alpha blend | `easing` |
| `DipToColor` | outgoing → opaque color → incoming | `color`, `easing` |
| `Push` | both Pictures travel together as one strip | `direction`, `easing` |
| `Slide` | incoming Picture travels over stationary outgoing Picture | `direction`, `easing` |
| `LinearWipe` | straight boundary reveals the incoming Picture | `direction`, `easing` |
| `Iris` | centered geometric aperture reveals the incoming Picture | `shape`, `easing` |
| `ZoomDissolve` | scale convergence plus complementary blend | `strength`, `easing` |
| `BlurDissolve` | complementary blend through a shared blur peak | `radius`, `easing` |

All effects accept `linear`, `ease-in`, `ease-out`, or `ease-in-out` easing. Directions are `left`,
`right`, `up`, or `down`. `Push` and `Slide` name Picture travel; `LinearWipe` names boundary travel.
`Iris` shapes are `circle`, `box`, and `diamond`. `DipToColor.color` is a six- or eight-digit hex
color. `ZoomDissolve.strength` is within 0–1, and `BlurDissolve.radius` is within 0–200 pixels.

```xml
<transition:DipToColor id="dip-white" color="#ffffff" easing="ease-in"/>
<transition:Push id="push-left" direction="left" easing="ease-in-out"/>
<transition:Slide id="cover-up" direction="up"/>
<transition:LinearWipe id="reveal-right" direction="right"/>
<transition:Iris id="diamond-open" shape="diamond"/>
<transition:ZoomDissolve id="zoom" strength="0.18"/>
<transition:BlurDissolve id="soft-blur" radius="24"/>
```

These declarations all produce the same public `VisualTransitionEffect` Type. Visual Track does not
enumerate them, and project or ecosystem packages can publish other effects through that Type.
Content-aware morphs, optical-flow effects, and true 3D page or cube geometry require their own
implementation rather than an approximation in this package.
