# Quickstart map

The repository docs are authoritative:

| Need | Read |
|---|---|
| Script semantics | `docs/quickstart/script.md` |
| SVS Recipes | `docs/quickstart/styles.md` |
| Media and Seedance | `docs/quickstart/generation.md` |
| Reusable Seedance Prompt Kits | `packages/seedance-kits/README.md` and the selected file under `packages/seedance-kits/kits/` |
| Normalization, alignment and SemanticTrack assembly | `docs/quickstart/timing.md` |
| Caption, Media, Text, Audio Tracks | `docs/quickstart/tracks.md` and the `@hypit/audio-track` package README |
| Film and rendering | `docs/quickstart/composition.md` |
| Run Source, durable Runtime, Builds, retrieval, and reuse | `docs/quickstart/run.md` and `runtime.md` |

Canonical path:

`Script → estimate:Speech/text → Seedance or supplied media → pipeline:Normalize → whisperx:SemanticTake → speech:Track → peer Caption/Media/Typography/Audio Tracks → Film → render:Video`.

Use explicit imports, exact fonts, Canvas/Frames, the SemanticTrack, Targets, and Runtime
authority. There is no implicit cache; reuse is explicit with `build-record` + `satisfy`.

`speech:Take source={...}` assembles one aligned `whisperx:SemanticTake` into the Track, in program
order. A take whose media normalizes with `video="none"` creates program time and speech audio while
peer Media Tracks provide the visuals.

For a program with no spoken words, keep the `whisperx:SemanticTake` and `speech:Track` declarations —
the SemanticTrack is the frame domain every `start`/`end` window resolves into — satisfy
`<track>.semantic` through `.svrun` `build-record` and `satisfy`, keep `<track>.visual` and
`<track>.audio` out of the Film so the alignment goes unreached, and omit the Caption components.

For execution, preserve the full lifecycle: diagnose the Profile, start or reuse the durable
Runtime, inspect the frozen plan, submit a named Build, inspect its accepted Records, retrieve
Artifacts, and declare any reuse explicitly in a new Run Source.
