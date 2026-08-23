# Quickstart map

Published docs and installed package declarations are authoritative:

| Need | Read |
|---|---|
| Script semantics | `https://narratage.hypit.ai/quickstart/script` |
| SVS Recipes | `https://narratage.hypit.ai/quickstart/styles` |
| Media and Seedance | `https://narratage.hypit.ai/quickstart/generation` |
| Reusable Seedance Prompt Kits | the installed `@hypit/seedance-kits` README and selected Kit |
| Normalization, alignment and SemanticTrack assembly | `https://narratage.hypit.ai/quickstart/timing` |
| Caption, Media, Text, Audio Tracks | `https://narratage.hypit.ai/quickstart/tracks` and installed package READMEs |
| Film and rendering | `https://narratage.hypit.ai/quickstart/composition` |
| Run Source, durable Runtime, Builds, retrieval, and reuse | `https://narratage.hypit.ai/quickstart/run` and `runtime.md` |

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

For execution, preserve the full lifecycle: select the Profile, inspect the frozen plan, run
`runtime up` when preflight is not ready, submit a fresh automatically identified Build, inspect its
accepted Records, retrieve Artifacts, and declare any reuse explicitly in a new Run Source.
