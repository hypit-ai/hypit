# Complex spoken explainer

A 137-second Chinese explainer built from 17 accepted performance clips, recorded demonstrations, project-owned MG, independent Caption and sound. The example demonstrates useful component boundaries without turning every design constant into a public parameter.

## Start here

Read the [archive compatibility and checkout instructions](../../README.md#archive-compatibility)
first. The hosted `20260914` Results require the pinned legacy source and CLI; they cannot be opened
with the current 0.3.x checkout by adding missing metadata fields.

From this production directory in the pinned checkout, use its own executable:

```sh
node ../../../../bin/hypit.mjs check runs/render.svrun
node ../../../../bin/hypit.mjs programs prepare --runtime ../../hypit.runtime.json --endpoint hyperframes.local
node ../../../../bin/hypit.mjs plan runs/render.svrun --runtime ../../hypit.runtime.json
node ../../../../bin/hypit.mjs studio --run runs/render.svrun --runtime ../../hypit.runtime.json
```

The production Run explicitly selects accepted Outputs. Read the plan before submitting a Build:
composition edits should retain that selected material. With matching source and Results, the
included local-only Profile selects the services needed to open and render the accepted work.

## Where an edit belongs

| Edit | Owner |
| --- | --- |
| Spoken words, Cue boundaries, Moments and Selections | `authors/script.svml` |
| Input images, recordings, fonts and clock/canvas | `authors/assets.svml` |
| Performance prompt and selected speaker Kit | `authors/direction.svml`, `recipes/performance.svs` |
| Material outputs, media placement, Uses, scene events and Film | `authors/main.svml` |
| Caption appearance and ordinary presentation | `recipes/composition.svs` |
| A coordinated visual behavior | The owning project package under `../../packages/` |
| Which accepted output is used | `runs/render.svrun` |

Generated-material and normalization outputs remain explicit in the entry Source so the Run can satisfy them by name. Imported files own Script, raw resources and direction; moving an output into a private imported graph would remove that entry’s reuse boundary.

## Components

`opening-system` owns opening graphics, flags, stage and presenter framing Styles. `web-scenes` owns eight coordinated demonstrations. `single-line-captions` presents Script cues through Caption’s semantics and public Companion interfaces. `launch-scenes` supplies the montage poster. `visual-language` is an ordinary shared palette/helper dependency. Each package README explains its inputs and ownership.

## Export

`runs/render.svrun` targets the complete film. `runs/export-parts.svrun` targets five consecutive ranges for machines with limited temporary disk. Each Build is a fresh execution attempt; the Run carries accepted material. The local profile currently requests eight rendering workers.

After exporting the five named Outputs with `hypit get`, join their video streams without re-encoding:

```sh
python3 scripts/assemble-final-export.py part-1.mp4 part-2.mp4 part-3.mp4 part-4.mp4 part-5.mp4 --output final.mp4
```

The helper derives each part’s length from its encoded video, removes each AAC part’s encoder delay before joining sound, and encodes one final audio stream. Parts must be consecutive, ordered and made with the same video settings.

Read [Treatment](TREATMENT.md), [craft notes](CRAFT-NOTES.md) and [asset provenance](ASSET-PROVENANCE.md). Private exploration and old outputs are preserved in history, outside the portable example.
