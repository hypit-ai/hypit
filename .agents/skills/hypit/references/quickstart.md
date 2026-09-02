# Quickstart map

Published docs and installed package declarations are authoritative:

| Need | Read |
|---|---|
| Script semantics | `../../../../docs/quickstart/script.md` |
| SVS Recipes | `../../../../docs/quickstart/styles.md` |
| Media and generation | `../../../../docs/quickstart/generation.md` |
| Timing and SemanticTrack assembly | `../../../../docs/quickstart/timing.md` |
| Caption, Media, Text and Audio Tracks | `../../../../docs/quickstart/tracks.md` and package READMEs |
| Film and rendering | `../../../../docs/quickstart/composition.md` |
| Run, Runtime, Build, Result and reuse | `../../../../docs/quickstart/run.md` and `runtime.md` |

Canonical path:

`Script → estimate:Speech/text → generated or supplied media → normalization → SemanticTake → speech:Track → peer visual/audio Tracks → Film → render:Video`.

Preview uses the same Graph with local mock media and estimate timing. It never edits Author Source and
never submits paid generation.

Use explicit imports, exact fonts, Canvas/Frames, SemanticTrack, Targets and Runtime authority. Reuse
is explicit through a named Result output referenced by `build-record` and `satisfy`.

Inspect the files and current Result directly after interruption. There is no route cursor to recover.
Do not submit a second paid Build when the needed Result already exists.
