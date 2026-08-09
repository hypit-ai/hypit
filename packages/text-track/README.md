# `@narratage/text-track`

Official provider-free Text overlay package. It owns a typed `TextTrackProgram` and lowers every
item into an independently timed and stacked Present in the public VisualTrack contract.

The current `TextTrackProgram@1` implements the complete pre-release Point/Area/Path author model:
bounded rich documents, exact font stacks, ordered Paint, frame/content/paragraph/line/run/word/
grapheme boxes, deterministic overflow and Unicode-aware local motion. It is not yet a frozen
public ABI because the shared Track and Visual IR freeze gates remain open.

An item spanning the complete ProgramSpace is a persistent overlay; a shorter item is timed. They
are not different Track kinds. Timing is projected through `@narratage/temporal`, and placement is
an explicit `SpatialFrame` input from `@narratage/spatial`; neither is hidden in the appearance
Recipe. The package exposes semantic typography rather than a rendering callback, arbitrary CSS or
cross-Track access.

The provider-free `<text:Track>` Surface validates `.svs` Recipes, accepts Program, Selection,
Moment or explicit point-expression timing plus explicit Point/Frame/Path edges, and produces the
same TextTrackProgram without changing Core or Film. `<text:Mask>` is a separate component that
consumes one authored Text Program and one owned still Surface; advanced/multiline/Path masks fail
closed and materialize through an independent package.
