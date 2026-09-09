# `@hypit/visual-ir`

The terminal visual vocabulary includes structural elements and explicit renderer-program payloads.
HyperFrames renders both structural elements and its browser program format.

## Writing a visual program

`VISUAL_IR_V1` identifies the supported visual vocabulary. A component emits ordinary Track,
Present and element data through `@hypit/composition`. The exported constants
`VISUAL_STYLE_NAMES_V1` and `VISUAL_STYLE_ENUM_VALUES_V1` describe supported CSS-shaped declarations;
`assertVisualStyleV1` checks an individual property/value pair. Element schemas are exposed by
`hypit vocabulary --visual <kind>`.

Static style values are strings or numbers. Resource-bearing image, video and text elements carry
their actual artifacts or font references as fields. Parents are local to one Present, and child
coordinates are relative to their parent.

An element may have an `animation` with ordered `keyframes`. Each keyframe has `atFrame`, optional
`easing`, and `style`. `atFrame` is measured from the containing Present's start. Supported animated
properties are `opacity`, `transform`, `filter`, `backdrop-filter` and `clip-path`; easing is `linear`, `ease-in`,
`ease-out` or `ease-in-out`. A renderer can evaluate these values at any requested frame.

Video playback uses the element's separate `sampling` map. Its local target intervals select source
frame positions and rates, with explicit loops or held frames where wanted. Typography can carry
richer text layout and unit motion through the text-flow/path-text shapes.

For prepared pixels from another rendering tool, emit a `surface` element with a typed
CompositableSurfaceRef. Its resource, geometry, color/alpha and temporal metadata let composition
place and sample it through the same Track model. Local masks name their owned content and mask
children. Preparation that transforms another material receives that material as an explicit input.

A `program` element carries an explicit format, an object payload and referenced artifacts. The
rendering package owns that payload's language and execution. It can place owned structural children
inside a local program, retaining typed media and fonts. For browser HTML/CSS/JavaScript see
[HyperFrames](../hyperframes/README.md#local-browser-programs). This separates structural convenience
from the renderer's fuller composition capabilities.
