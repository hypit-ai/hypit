# `@narratage/text-track`

Official provider-free Text overlay package. It owns a typed `TextTrackProgram` and lowers every
item into an independently timed and stacked Present in the public VisualTrack contract.

The current `TextTrackProgram@1` is an executable vertical-slice fixture, not the frozen official
Text authoring protocol. It proves package-to-IR lowering but does not yet reproduce the old
three-box layout, exact-font and layered-decoration capability gate.

An item spanning the complete ProgramSpace is a persistent overlay; a shorter item is timed. They
are not different Track kinds. Timing is projected through `@narratage/temporal`, and placement is
an explicit `SpatialFrame` input from `@narratage/spatial`; neither is hidden in the appearance
Recipe. The package exposes semantic typography rather than a rendering callback, arbitrary CSS or
cross-Track access.

The provider-free `<text:Track>` Surface validates `.svs` Recipes, accepts explicit full or
Selection timing plus a `SpatialFrame` edge for every Item, and produces the same TextTrackProgram
without changing Core, Film, Composition or HyperFrames. Exact FontArtifact lowering and the full
Point/Area/Path Text model remain pre-freeze work.
