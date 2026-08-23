# `@hypit/studio-video-adapters`

The official video-domain interpretation shipped with Hypit Studio: Speech,
Media, Audio, Text, Caption, Ranking and generic terminal Track fallbacks.

This package owns video-specific lane ranges, entity projection and timeline
semantics. `@hypit/studio` owns session assembly and uniform UI chrome. Author
and domain packages know neither package exists.

Temporal presentation consumes Studio's executed-graph bindings. Window-backed Items show their
actual endpoints, while Deck activations, Media Sequence terminals and triggered Ranking Items show
their actual Point expression. The adapters do not recreate projection lineage from markup or
renderer naming conventions.
