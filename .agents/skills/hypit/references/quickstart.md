# Quickstart map

Published docs and installed package declarations are authoritative:

| Need | Read |
|---|---|
| Script semantics | `../../../../docs/quickstart/script.md` |
| SVS Recipes | `../../../../docs/quickstart/styles.md` |
| Media and Seedance | `../../../../docs/quickstart/generation.md` |
| Reusable Seedance Prompt Kits | the installed `@hypit/seedance-kits` README and selected Kit |
| Normalization, alignment and SemanticTrack assembly | `../../../../docs/quickstart/timing.md` |
| Caption, Media, Text, Audio Tracks | `../../../../docs/quickstart/tracks.md` and installed package READMEs |
| Film and rendering | `../../../../docs/quickstart/composition.md` |
| Run Source, durable Runtime, Builds, retrieval, and reuse | `../../../../docs/quickstart/run.md` and `runtime.md` |

Canonical production path:

`Script → estimate:Speech/text → Seedance or supplied media → pipeline:Normalize → whisperx:SemanticTake → speech:Track → peer Caption/Media/Typography/Audio Tracks → Film → render:Video`.

Preview path uses the same Graph with `@hypit/preview-mock`: image/video/audio outputs are replaced
by ordinary mock Artifacts, and WhisperX `SemanticTake` is replaced by `semantic-take-estimate` using
`estimate:Speech`. This preview substitution never enters Author Source and is not final timing evidence.

Use explicit imports, exact fonts, Canvas/Frames, the SemanticTrack, Targets, and Runtime
authority. There is no implicit cache; reuse is explicit with `build-record` + `satisfy`.

`speech:Take source={...}` assembles one aligned `whisperx:SemanticTake` into the Track, in program
order. The take that speaks a Segment is the take that draws it, so that one value carries the
program time, the speech and the picture together; peer Media Tracks put inserts over it.

For a program with no spoken words, keep the `whisperx:SemanticTake` and `speech:Track` declarations —
the SemanticTrack is the frame domain every `start`/`end` window resolves into — satisfy
`<track>.semantic` through `.svrun` `build-record` and `satisfy`, keep `<track>.visual` and
`<track>.audio` out of the Film so the alignment goes unreached, and omit the Caption components.

For execution, preserve the full lifecycle: select the Profile, inspect the frozen plan, run
`runtime up` when preflight is not ready, submit a fresh automatically identified Build, inspect its
accepted Records, retrieve Artifacts, and declare any reuse explicitly in a new Run Source.

Both production routes expose current progress in `.hypit/route-state.json` and preserve each
execution under `.hypit/routes/<route-id>/`; after an interruption, follow
`references/recovery.md` and reconcile before resuming. Before `preview_check`, run
`inspect_svml_vocabulary --run`, `validate_local_author_packages --run` and
`validate_script_cues --run`; the preview and final checks repeat these gates.
