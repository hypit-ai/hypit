# `@svml/caption`

Pure composition between the common Narrative's untimed Caption Projection and a CompleteSemanticMap.
The authored display region receives the evidence-backed envelope of the speech tokens it owns.
Exact internal correspondences may reuse evidence timing; unresolved display words remain untimed
until a track explicitly chooses a local presentation policy.

`planCaptionPresentation()` is that optional track-local policy. `whole` preserves each authored
region; `proportional-word` and `character-flow` create visibly labelled estimates. They never
write those estimates back into the global speech map or Caption Projection.
