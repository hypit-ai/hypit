# @narratage/ranking

Four independent progressive-ranking author components over one private schedule utility:

- `TierBoard`
- `Column`
- `TopThree`
- `TypewriterList`

The package owns variant-specific Programs and Styles. It consumes explicit Selection/Moment,
SemanticMap, ProgramSpace, SpatialFrame, font, image and optional sound edges, then lowers to peer
`VisualTrack` and optional `AudioTrack` values. It adds no Ranking field to Core, Composition or
Visual IR.

Each `*Style` declaration compiles one SVS Recipe and exact font reference into its visual Style
plus a private named `.sound` Style output. A Ranking component connects both outputs when authored
sound exists; no sound produces no audio branch.

See [`../../spec/ranking-track.md`](../../spec/ranking-track.md) for the normative pre-release model.
