# `@hypit/visual-treatment`

`@hypit/visual-treatment` supplies reusable one-input Picture Operators. The owning audiovisual
Occurrence supplies identity, resolved time and placement; this package owns only how its input Picture
is transformed.

The new audiovisual backend consumes these effects as package-owned `PictureOperator` values. A typed
`VisualTreatmentOperatorSpec` carries complete normalized states into the `picture-operator` Producer;
the Producer also receives the exact local Control domain. The result owns one named `picture` port, one
named `progress` Control and an opaque executable HTML programme. Each AVIR use binds that Control to a
Programme, Occurrence, Source or explicit Mapping. Normalization and interpolation remain package-owned.

## Official effects

| Declaration | Picture operation | Parameters |
| --- | --- | --- |
| `Transform` | affine placement | `x`, `y`, `scale` or `scale-x`/`scale-y`, `rotate`, `origin-x`, `origin-y` |
| `Opacity` | alpha multiplication | `value` |
| `Blur` | Gaussian blur | `radius` |
| `Color` | one ordered browser-sRGB color operation | `brightness`, `contrast`, `saturation`, `hue`, `grayscale`, `sepia`, `invert` |

One complete normalized state makes a static effect. Two or more complete states interpolate over
the owning Occurrence and must include positions `0` and `1`; optional easing is `linear`, `ease-in`,
`ease-out`, or `ease-in-out`. All configurations produce the public `PictureOperator` Type with one
named `picture` port. Separate AVIR `apply` nodes make effect order explicit; `Color` alone defines one
stable order for parameters that jointly form one color operation.

The package owns the `hypit.visual-treatment.html@1` execution payload and closes it over the named Picture
slot as an ordinary `hypit.html-visual@1` programme. `@hypit/html-program` remains unaware of treatment
kinds and only executes the generic programme envelope.
