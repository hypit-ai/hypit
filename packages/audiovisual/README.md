# `@hypit/audiovisual`

Renderer-independent AVIR Programme facts, validation and exact clock-free evaluation.

AVIR does not parse TSX, NLE documents, AIGC recipes or semantic queries. TSX is materialized into NLE facts before
this package receives a closed Programme projection.

The package owns one live evaluation constitution. Picture implementations must support independent exact
positions; Audio implementations consume explicit finite ranges. Invocation-local linking closes Picture as an
`HtmlProgram` and Audio as an `AudioProgram`. Output clocks, browser processes, encoding, caches and delivery belong
to terminal execution packages.

An invocation can close a finite Picture range and rational frame grid into exact observations. Pure demand planning
projects those observations through graph relations and Temporal Maps into Source-local ranges and samples. It does
not select an execution Terminal; the complete Picture Programme closes into one terminal programme.

Sources and Operators name an installed npm package plus a package-owned symbol. The project lockfile owns
implementation versions. AVIR contains no package source text or automatic Media materialization.

One mapped Source selection may carry an explicit package-owned signal reconstruction. The Temporal Map remains
the only source-position relation; reconstruction selects non-default Picture or Audio interpretation such as
nearest-frame sampling or pitch-preserving stretch. Spatial relations support affine/projective evaluation,
composition, inversion and animated interpolation without choosing renderer pixels.

The current `spatial` export is an AVIR source module rather than a separate release boundary. It may move
to a shared package only after another owner proves an independent consumer.
