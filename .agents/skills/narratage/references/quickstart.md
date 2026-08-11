# Quickstart map

The repository docs are authoritative:

| Need | Read |
|---|---|
| Script semantics | `docs/quickstart/script.md` |
| SVS Recipes | `docs/quickstart/styles.md` |
| Media and Seedance | `docs/quickstart/generation.md` |
| Reusable Seedance Prompt Kits | `packages/seedance-kits/README.md` and the selected file under `packages/seedance-kits/kits/` |
| Speech Spine and SemanticMap | `docs/quickstart/timing.md` |
| Caption, Media, Text, Audio Tracks | `docs/quickstart/tracks.md` and the `@narratage/audio-track` package README |
| Film and rendering | `docs/quickstart/composition.md` |
| Run Source and Runtime | `docs/quickstart/run.md` |

Canonical path:

`Script → estimate:Speech/text → Seedance or supplied media → Speech Spine → WhisperX SemanticMap → peer Caption/Media/Text/Audio Tracks → Film → render:Video`.

Use explicit imports, exact fonts, Canvas/Frames, ProgramSpace, package locks, Targets, and Runtime
authority. There is no implicit cache; reuse is explicit with `build-record` + `satisfy`.
