# Quickstart map

The repository docs are authoritative:

| Need | Read |
|---|---|
| Script semantics | `docs/quickstart/script.md` |
| SVS Recipes | `docs/quickstart/styles.md` |
| Media and Seedance | `docs/quickstart/generation.md` |
| Reusable Seedance Prompt Kits | `packages/seedance-kits/README.md` and the selected file under `packages/seedance-kits/kits/` |
| Speech Spine and SemanticMap | `docs/quickstart/timing.md` |
| Caption, Media, Text, Audio Tracks | `docs/quickstart/tracks.md` and the `@hypit/audio-track` package README |
| Film and rendering | `docs/quickstart/composition.md` |
| Run Source, durable Runtime, Builds, retrieval, and reuse | `docs/quickstart/run.md` and `references/runtime.md` |

Canonical path:

`Script → estimate:Speech/text → Seedance or supplied media → Speech Spine → WhisperX SemanticMap → peer Caption/Media/Typography/Audio Tracks → Film → render:Video`.

Use explicit imports, exact fonts, Canvas/Frames, ProgramSpace, Targets, and Runtime
authority. There is no implicit cache; reuse is explicit with `build-record` + `satisfy`.

Use `speech:Take video={...}` for a speech-bearing A/V take and `speech:Take audio={...}` for
voiceover. An audio Take creates program time and speech audio while peer Media Tracks provide the
visuals.

For a speech-free program, select a verified ProgramSpace Record through `.svrun` `build-record`
and `satisfy`, use explicit Track windows, and omit WhisperX and Caption components.

For execution, preserve the full lifecycle: diagnose the Profile, start or reuse the durable
Runtime, inspect the frozen plan, submit a named Build, inspect its accepted Records, retrieve
Artifacts, and declare any reuse explicitly in a new Run Source.
