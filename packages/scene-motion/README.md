# `@hypit/scene-motion`

Foundational package-owned Scene Behaviors. Camera dolly motion supplies a semantic
distance, fixed aim point and easing. `camera-path` describes a continuous camera
position, aim and optional field-of-view path; `object-path` gives a Scene Object a
continuous position and orientation path. Linear and Catmull–Rom paths share the
Item's exact local duration.

The package does not own Performance placement, Shots, editor playheads or
rendering. Those remain with `@hypit/scene` and its Host.
