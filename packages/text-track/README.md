# `@narratage/text-track`

Official provider-free Text overlay package. It owns a typed `TextTrackProgram` and lowers every
item into an independently timed and stacked Present in the public VisualTrack contract.

The current `TextTrackProgram@1` is an executable vertical-slice fixture, not the frozen official
Text authoring protocol. It proves package-to-IR lowering but does not yet reproduce the old
three-box layout, exact-font and layered-decoration capability gate.

An item spanning the complete ProgramSpace is a persistent overlay; a shorter item is timed. They
are not different Track kinds. The package exposes semantic typography and box parameters rather
than a rendering callback, arbitrary CSS or cross-Track access.

The provider-free `<text:Track>` Surface now validates `.svs` Recipes, compiles `during="full"`
against an explicitly connected ProgramSpace and produces the same TextTrackProgram without
changing Core, Film, Composition or HyperFrames. Timed semantic windows and exact FontArtifact
lowering remain pre-freeze work.
