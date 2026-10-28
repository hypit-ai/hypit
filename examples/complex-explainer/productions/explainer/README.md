# Complex spoken explainer

A 137-second Chinese explainer built from 17 accepted performance clips, recorded demonstrations, project-owned MG, independent Caption and sound. The example demonstrates useful component boundaries without turning every design constant into a public parameter.

## Start here

From this production directory:

```sh
hypit check runs/render.svrun
hypit plan runs/render.svrun
hypit studio --invocation runs/render.svrun
```

The accepted performances and supporting media are ordinary project assets selected by the Author Source.
The `.svrun` file is only a saved Invocation target. Read the plan before submitting a Build; speech evidence is
still produced by the explicitly authored transcription declarations unless the Source is changed to
use project-owned transcript evidence.

## Where an edit belongs

| Edit | Owner |
| --- | --- |
| Spoken words, Cue boundaries, Moments and Selections | `authors/script.svml` |
| Input images, recordings, fonts and clock/canvas | `authors/assets.svml` |
| Performance prompt and selected speaker Kit | `authors/direction.svml`, `recipes/performance.svs` |
| Material outputs, media placement, Uses, scene events and Film | `authors/main.svml` |
| Caption appearance and ordinary presentation | `recipes/composition.svs` |
| A coordinated visual behavior | The owning project package under `../../packages/` |
| Which accepted performance file is used | `authors/assets.svml` and `authors/main.svml` |

Generated-material and preparation relations remain explicit in the entry Source. Imported Sources own
Script, raw resources and direction; the saved Invocation only selects targets.

## Components

`opening-system` owns opening graphics, flags, stage and presenter framing Styles. `web-scenes` owns eight coordinated demonstrations. `single-line-captions` presents Script cues through Caption’s semantics and public Companion interfaces. `launch-scenes` supplies the montage poster. `visual-language` is an ordinary shared palette/helper dependency. Each package README explains its inputs and ownership.

## Export

`runs/render.svrun` targets the complete film. `runs/export-parts.svrun` targets five consecutive ranges for machines with limited temporary disk. Each Build is a fresh execution attempt; both files are target-only Invocation presets. The local profile currently requests eight rendering workers.

After exporting the five named Outputs with `hypit get`, join their video streams without re-encoding:

```sh
python3 scripts/assemble-final-export.py part-1.mp4 part-2.mp4 part-3.mp4 part-4.mp4 part-5.mp4 --output final.mp4
```

The helper derives each part’s length from its encoded video, removes each AAC part’s encoder delay before joining sound, and encodes one final audio stream. Parts must be consecutive, ordered and made with the same video settings.

Read [Treatment](TREATMENT.md), [craft notes](CRAFT-NOTES.md) and [asset provenance](ASSET-PROVENANCE.md). Private exploration and old outputs are preserved in history, outside the portable example.
