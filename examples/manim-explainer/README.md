# Hypit x Manim showcase

An editable portrait production showing an English Seedance presenter with three independent,
opaque Manim MP4 tracks. The Manim Python scenes own their internal animation. The Hypit project
component owns only video sampling, layout, scale, opacity, brightness and stacking.

Read [Brief](BRIEF.md) for the commissioned goal, [Treatment](TREATMENT.md) for the intended
viewing experience, [Craft Notes](CRAFT-NOTES.md) for the directing decisions and [Asset Provenance](ASSET-PROVENANCE.md) for the active media boundary.

## Start here

From this production directory:

```sh
npm ci --ignore-scripts
hypit check runs/render.svrun --workspace .
hypit plan runs/render.svrun --workspace . --runtime hypit.runtime.json
hypit studio --run runs/render.svrun --workspace . --runtime hypit.runtime.json
```

`runs/render.svrun` is the canonical complete-production entry, matching the other production
examples: it targets `final.video` and explicitly reuses the five accepted presenter video Outputs
from an earlier Build. Normalize, speech alignment, the project component, Film and final rendering
remain live in the current Author graph. The referenced Build Results must be available in the local
Hypit Results repository; inspect `hypit plan` before building. Use `runs/generate.svrun` when you
want to generate only the five presenter video Outputs for a new iteration, then update the
`build-record` entries after accepting that Build.

The canonical Run intentionally recomputes normalization, speech alignment, component output and
Film from the selected presenter media and the project-local Manim renders. It reuses only the
expensive presenter generation; further accepted Outputs can be added as explicit Candidates when
an iteration needs to retain them.

## Canonical production shape

The active production follows the complex-production example at the same authoring granularity:

```text
BRIEF.md / TREATMENT.md / ASSET-PROVENANCE.md / CRAFT-NOTES.md
authors/  assets.svml  script.svml  direction.svml  main.svml
recipes/  composition.svs  performance.svs
runs/     generate.svrun  render.svrun
manim-scenes/  three independent Manim scene sources
packages/    project-local Hypit component
manim-renders/     accepted external Manim intermediates
```

Only `manim-renders/math_block.mp4`, `manim-renders/ml_block.mp4` and `manim-renders/physics_block.mp4` are active
Manim inputs. Generated renders, QA captures, exported videos, runtime state and historical drafts
are intentionally omitted from this repository template.

## Where an edit belongs

| Edit | Owner |
| --- | --- |
| Spoken words and paragraph boundaries | `authors/script.svml` |
| Presenter direction and pronunciation | `authors/direction.svml`, `recipes/performance.svs` |
| Seedance generation requests | `authors/main.svml`, `runs/generate.svrun` |
| Input media, clock and canvas | `authors/assets.svml` |
| Timeline, media normalization, component, audio and Film | `authors/main.svml` |
| Card appearance defaults | `recipes/composition.svs` |
| Coordinated card motion and cue timing | `packages/manim-showcase/src/render.ts` |
| Accepted output selection for an iteration | `runs/render.svrun` Build Records, updated after acceptance |
| Manim scene content | `manim-scenes/math_block.py`, `manim-scenes/ml_block.py`, `manim-scenes/physics_block.py` |

## Components

`@project/manim-showcase` owns the coordinated card scene. It accepts the presenter, three opaque
Manim videos, the Canvas and four Script Moments. Its public boundary is deliberately small:
sampling, placement, scale, opacity, brightness, stacking and canvas containment. The Python scenes
remain independent external authoring sources, and the Film/audio wiring remains in
`authors/main.svml`.

The package registers a Studio Companion for the same `scene` Surface and VisualTrack output. The
Companion supplies a recognizable timeline lane and display title; it does not create a second
rendering path or expose internal HTML and Manim implementation details as author fields.

## External Manim handoff

Render and inspect each scene independently before checking the Hypit graph:

```sh
uv sync --frozen
uv run --frozen manim render --config_file manim.cfg --format mp4 --fps 30 -r 1280,720 \
  --resolution 1280,720 --output_file math_block manim-scenes/math_block.py MathBlock
uv run --frozen manim render --config_file manim.cfg --format mp4 --fps 30 -r 1280,720 \
  --resolution 1280,720 --output_file ml_block manim-scenes/ml_block.py MLBlock
uv run --frozen manim render --config_file manim.cfg --format mp4 --fps 30 -r 1280,720 \
  --resolution 1280,720 --output_file physics_block manim-scenes/physics_block.py PhysicsBlock
```

The active files are `manim-renders/math_block.mp4`, `manim-renders/ml_block.mp4` and
`manim-renders/physics_block.mp4`. They are separate H.264 `yuv420p` inputs without alpha. The
current local files do not all report a constant 30/1 frame rate in `ffprobe`; see
[Asset Provenance](ASSET-PROVENANCE.md). Re-render or normalize them and confirm their frame rate
matches the shared Timeline before treating these local files as verified inputs. The component
uses the Timeline frame rate as its sampling timebase and cannot infer source metadata from a
`BlobRef`. The HTML component samples and places them; it does not generate their internal motion.

## Build

```sh
npm run build --prefix packages/manim-showcase
```

The current production canvas is 720x1280 and its shared Timeline is 30 fps. The component uses the
Timeline frame rate as its sampling timebase rather than requiring 30 fps as a package contract. The
presenter remains full-frame throughout; at `First`, `Next` and `Finally`, the corresponding card
is focused, enlarged and brightened while the other two remain smaller and dimmed. At `These`, all
three return to the small overview arrangement and continue to loop. The native Seedance English
voice is the only narration.
