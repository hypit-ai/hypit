# `@hypit/media-track`

Official provider-free Media Item and Sequence authoring package.

`Track` accepts explicit ProgramSpace, CanvasSpace and, when semantic points are used, a
SemanticTrack. Each independently timed `Item` receives an explicit SpatialFrame and either
one direct source or ordered Paint/sample layers. A visual source is always named by its actual
form: `image`, prepared `media`, or compositable `surface`. Moving video must be prepared by an
explicit Media Pipeline `Normalize` Operation before it enters the Track; the Track never guesses a
stream, frame rate or audio policy. `Sequence` owns an ordered replacement surface with explicit
activation points and pairwise Handoffs. Package-owned Recipes cover fitting, source occupancy,
frame Paint, clipping, borders, shadows, lifecycle motion and sampling motion.

Ordinary Items consume projected `TemporalWindow` values. Sequence Member activations and the
Sequence terminal consume projected `TemporalPoint` values instead; the Sequence component owns
only the schedule and handoff consumption that follows those points. All domain Producers receive
ProgramSpace explicitly and do not locate semantic sources themselves.

Visual and audio are separate deterministic projections. A visual-only Track exports only
`VisualTrack`; selecting one source layer's audio or adding explicit enter/exit/handoff sounds also
exports a peer `AudioTrack`. Speech Track reuses the same lowering laws through a deliberately
restricted internal projection.

The package lowers only track composition. It does not add Media, B-roll or Provider meaning to Core,
Film, Composition or HyperFrames. “B-roll” is an editorial use of an ordinary Item or Sequence.
