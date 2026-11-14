# @hypit/picture-transition

`@hypit/picture-transition` supplies reusable two-input Picture Operators. The owning audiovisual
Programme decides which two closed Pictures participate and over what occurrence Domain; this package
owns only how those Pictures combine.

For the new audiovisual backend, this package publishes every official effect through one typed
`picture-operator` Producer. The Producer receives a `PictureTransitionOperatorSpec` and the exact local
Control domain. The resulting Operator declares a named `progress` Control; each AVIR `apply` binds that
coordinate to Programme, Occurrence, Source or an explicit Mapping. The package projects the bound exact
position to normalized progress and owns easing. Its package-owned spec selects and configures the
implementation; the resulting `PictureOperator` carries the exact ordered ports (`outgoing`, `incoming`)
and its opaque HTML execution programme together. `@hypit/audiovisual` neither enumerates transition names
nor asks a terminal to recover an implementation from an id. There is no Track adjacency rule in this package.

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

Each configuration produces the same public `PictureOperator` Type with the exact ordered ports
`outgoing` and `incoming` plus the `progress` Control. Project or ecosystem packages can publish other operators without changing
AVIR.
Content-aware morphs, optical-flow effects, and true 3D page or cube geometry require their own
implementation rather than an approximation in this package.

The package also contributes an `hypit.nle-package` Transition resolver. A persistent NLE stores only the
outgoing/incoming Item identities, package symbol and operator parameters; the NLE derives the exact overlap
domain and binds the Operator's `progress` Control during one-way AVIR lowering.
