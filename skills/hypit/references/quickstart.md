# Quickstart map

The selected Distribution's published docs and installed package declarations are authoritative.
`<distribution-root>` is the root reported by the selected launcher; it is not the installed Skill
directory and it is not the author project:

| Need | Read |
|---|---|
| Script semantics | `<distribution-root>/docs/quickstart/script.md` |
| SVS Recipes | `<distribution-root>/docs/quickstart/styles.md` |
| Media and generation | `<distribution-root>/docs/quickstart/generation.md` |
| Timing and SemanticTrack assembly | `<distribution-root>/docs/quickstart/timing.md` |
| Caption, Media, Text and Audio Tracks | `<distribution-root>/docs/quickstart/tracks.md` and package READMEs |
| Film and rendering | `<distribution-root>/docs/quickstart/composition.md` |
| Run, Runtime, Build, Result and reuse | `<distribution-root>/docs/quickstart/run.md` and `runtime.md` |

Canonical path:

`Script → estimate:Speech/text → generated or supplied media → normalization → SemanticTake → speech:Track → peer visual/audio Tracks → Film → render:Video`.

Preview uses the same Graph with local mock media and estimate timing. It never edits Author Source and
never submits paid generation.

Use explicit imports, exact fonts, Canvas/Frames, SemanticTrack, Targets and Runtime authority. Reuse
is explicit through a named Result output referenced by `build-record` and `satisfy`.

Inspect the files and current Result directly after interruption. There is no route cursor to recover.
Do not submit a second paid Build when the needed Result already exists.
