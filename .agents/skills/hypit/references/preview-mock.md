# Native preview mock realization

Preview-only mock media belongs to `@hypit/preview-mock`; byte producers belong to
`@hypit/mock-media`, and generic graph inspection belongs to `@hypit/compiler-node`.

The lifecycle is fixed:

```text
build.svrun → compiler-node Author/Run Graph → preview-mock realization
→ temporary .hypit/preview/<digest>/preview.svrun
→ mock-media local Provider materialization → Studio deterministic preview
```

`realizePreviewMock({run, targets?, timing: "estimate"})` derives replacements from the compiled
Graph. It must not parse SVML dimensions, read a reference transcript, write a user Source, or emit
absolute-path `<file>` Candidates. The temporary Run uses the existing `<fragment>` and `<satisfy>`
syntax and contains only Author references, mock imports/declarations, satisfactions, and explicitly
carried Run Candidates.

Mock mapping is ordinary graph substitution: image/video/audio BlobArtifact outputs use
`mock:image`, `mock:video`, and `mock:silence`; WhisperX SemanticTake outputs use the
`semantic-take-estimate` policy and preserve Narrative, Segment, Token, and Anchor identity.
Estimated timing is always `estimate:Speech`. Reference WhisperX remains evidence for shot/window
comparison only.

Geometry priority is Canvas width/height, then generation aspect-ratio, then the Canvas fallback.
Resolution labels such as `720p` and `2K` are not converted to pixels; contradictory geometry fails.
Mock Artifacts are content-addressed and cached by Author source digest, Run digest, target closure,
geometry policy, and timing mode. They never enter Author Source or coverage gates. Observers should
recognize mock regions as preview scaffolding and ignore them when assessing visual fidelity.

`reference-video-tools render_element` delegates to this realization, renders the complete program
once in Studio, cuts the requested window, writes a sidecar with `"timing_basis": "estimate"`, and
then invokes comparison. `make_placeholder`, hand-written SemanticTake JSON, hand-written `.media.json`,
SVML regex geometry extraction, and absolute-path Candidates are retired from the public route.
