# `@svml/caption`

Pure composition between the common Narrative's untimed Caption Projection and a CompleteSemanticMap.
The authored display region receives the evidence-backed envelope of the speech tokens it owns.
Exact internal correspondences may reuse evidence timing; unresolved display words remain untimed
until a track explicitly chooses a local presentation policy.

`planCaptionPresentation()` is that optional track-local policy. `whole` preserves each authored
region; `proportional-word` and `character-flow` create visibly labelled estimates. They never
write those estimates back into the global speech map or Caption Projection.

`captionComponent` exposes two enumerable deterministic Producers:

- `temporalize-caption`: `Narrative + CompleteSemanticMap -> TimedCaptionProjection`;
- `render-caption-track`: `TimedCaptionProjection + CaptionTrackProgram -> VisualTrack`.

It also owns and validates both Caption-specific Types. Their validator identities and both
Producer implementations are checked against `captionManifest` and enter the installed package
lock. The package has no Provider, LLM, queue, credential or Core authority.

The current `CaptionTrackProgram` is an executable vertical-slice program, not the frozen public
style language. Exact font Artifacts, the complete production positioning/style matrix, role
overrides, package-owned SVS Recipes, Gemini cue grouping and the final author Surface require a
separate capability audit before compatibility freeze.
