# `@hypit/picture-filter`

`@hypit/picture-filter` owns one unary photometric Picture Operator. It changes opacity, blur and
browser-sRGB filter parameters without changing temporal placement or spatial mapping.

The low-level value is one complete `PictureFilterState`. A static state produces a Picture Operator
with no Control. Time-varying filtering uses the shared
`TemporalControl<PictureFilterState, PictureFilterInterpolation>` algebra and publishes its exact Domain as the
named `filter` Control. An AVIR `apply` node decides whether that Control follows the Programme, an
Occurrence, a Source or an explicit Mapping.

Transform, position, scale and rotation intentionally do not exist here. Those are SpatialMap facts.
Author frontends may offer separate Opacity, Blur or Color conveniences, but they lower into this one
complete state rather than inventing another keyframe or normalized-progress model.

For a persistent NLE project the package contributes an `hypit.nle-package@1` Picture Adjustment resolver. The NLE stores
the package symbol and one package-owned parameter value:

Keyframed parameters select `linear`, `ease-in`, `ease-out` or `ease-in-out`. The package applies that
selection in both AVIR evaluation and its HTML implementation; NLE Core does not own a motion-policy catalog.

- `{ kind: "constant", state }` resolves to the static Picture Operator;
- `{ kind: "keyframes", keyframes, interpolation: { kind: "linear" } }` stores strictly increasing Item-local
  `{ at: ExactTemporalValue, state }` entries beginning at zero and resolves them to the shared exact
  `TemporalControl`.

The package owns the complete state, parameter spelling, validation and interpolation. NLE Core sees only
`CanonicalValue`; it has no Picture Filter fields, central Keyframe type or easing catalogue. The controlled
Operator's `filter` Domain is identical to the Adjustment Item Domain, so default NLE lowering makes the
animation follow an Adjustment move. A keyframe outside the current Item duration is rejected rather than clamped or
silently discarded.

The package also contributes an optional `hypit.nle-authoring@1` Adjustment-parameter owner. Its first typed edit
operations replace a constant state or insert/replace one Item-local keyframe state. The generic NLE Host does not
interpret either operation: it asks this package for the next canonical parameter value and wraps that result in
one ordinary `item.replace` transaction. Consequently Track locks and snapshot-based undo apply without a
Picture Filter branch in NLE Core. The package publishes no Canvas handles.
