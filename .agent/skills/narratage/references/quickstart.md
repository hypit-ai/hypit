# Quickstart map

The repository docs are authoritative:

| Need | Read |
|---|---|
| Script semantics | `docs/quickstart/script.md` |
| SVS Recipes | `docs/quickstart/styles.md` |
| Media and Seedance | `docs/quickstart/generation.md` |
| Speech Spine and SemanticMap | `docs/quickstart/timing.md` |
| Caption, Media, Typography Tracks | `docs/quickstart/tracks.md` |
| Film and rendering | `docs/quickstart/composition.md` |
| Run Source and Runtime | `docs/quickstart/run.md` |

Canonical path:

`Script → Estimate/Seedance → Speech Spine → WhisperX SemanticMap → peer Caption/Media/Text/Audio Tracks → Film → render:Video`.

Use explicit imports, exact fonts, Canvas/Frames, ProgramSpace, package locks, Targets, and Runtime
authority. There is no implicit cache; reuse is explicit with `build-record` + `satisfy`.
