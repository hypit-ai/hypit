# `@hypit/picture-filter`

`@hypit/picture-filter` owns one unary photometric Picture Operator. It changes opacity, blur and
browser-sRGB filter parameters without changing temporal placement or spatial mapping.

The low-level value is one complete `PictureFilterState`. A static state produces a Picture Operator
with no Control. Time-varying filtering uses the shared
`TemporalControl<PictureFilterState, { kind: "linear" }>` algebra and publishes its exact Domain as the
named `filter` Control. An AVIR `apply` node decides whether that Control follows the Programme, an
Occurrence, a Source or an explicit Mapping.

Transform, position, scale and rotation intentionally do not exist here. Those are SpatialMap facts.
Author frontends may offer separate Opacity, Blur or Color conveniences, but they lower into this one
complete state rather than inventing another keyframe or normalized-progress model.
