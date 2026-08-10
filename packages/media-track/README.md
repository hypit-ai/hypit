# `@narratage/media-track`

Official provider-free Media Item and Sequence authoring package.

`Track` accepts explicit ProgramSpace, CanvasSpace and, when semantic points are used, a
CompleteSemanticMap. Each independently timed `Item` receives an explicit SpatialFrame and either
one direct source or ordered Paint/sample layers. A visual source is always named by its actual
form: `image`, generated/raw `video`, prepared `media`, or compositable `surface`. Raw video is
automatically inspected and normalized to the connected ProgramSpace; `audio="include"` opts its
audio into the same normalization. `Sequence` owns an ordered replacement surface with explicit
activation points and pairwise Handoffs. Package-owned Recipes cover fitting, source occupancy,
frame Paint, clipping, borders, shadows, lifecycle motion and sampling motion.

Visual and audio are separate deterministic projections. A visual-only Track exports only
`VisualTrack`; selecting one source layer's audio or adding explicit enter/exit/handoff sounds also
exports a peer `AudioTrack`. Speech Spine reuses the same lowering laws through a deliberately
restricted internal projection.

The automatic lowering is Surface behavior, not a privileged Runtime route: it produces the same
ordinary Media Pipeline Operations that an author can write explicitly through
`@narratage/media-pipeline`. The package does not add Media, B-roll or Provider meaning to Core,
Film, Composition or HyperFrames. “B-roll” is an editorial use of an ordinary Item or Sequence. The
complete pre-release contract and acceptance matrix live in `spec/media-track.md`.
