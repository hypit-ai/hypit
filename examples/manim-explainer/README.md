# Hypit x Manim showcase

An editable portrait production showing an English Seedance presenter with three independent,
opaque Manim MP4 tracks. The five normalized Seedance clips occupy consecutive Timeline Windows
and are placed through the standard Visual and Audio Tracks. The Manim Python scenes own their internal animation;
the project component owns only the three cards' sampling, layout, scale, opacity, brightness and stacking.

Read [Brief](BRIEF.md) for the commissioned goal, [Treatment](TREATMENT.md) for the intended
viewing experience, [Craft Notes](CRAFT-NOTES.md) for the directing decisions and [Asset Provenance](ASSET-PROVENANCE.md) for the active media boundary.

## Start here

From the Hypit repository root:

Follow [Manim environment setup](../../skills/hypit/references/creation/manim.md#keep-the-python-project-with-the-production)
for native prerequisites and [local Runtime preparation](../../skills/hypit/references/environment/local-tools.md)
for the selected browser and WhisperX helpers.

```sh
corepack pnpm install --frozen-lockfile
PATH_TO_HYPIT="$(pwd)/bin/hypit.mjs"
npm run build --prefix examples/manim-explainer/packages/provider-vectrust-seedance
npm run build --prefix examples/manim-explainer/packages/manim-showcase
(cd examples/manim-explainer && node "$PATH_TO_HYPIT" auth login vectrust.seedance --runtime hypit.runtime.json)
node "$PATH_TO_HYPIT" programs prepare --endpoint html.local --project examples/manim-explainer --runtime examples/manim-explainer/hypit.runtime.json
node "$PATH_TO_HYPIT" programs up --endpoint whisperx.local --project examples/manim-explainer --runtime examples/manim-explainer/hypit.runtime.json
uv sync --frozen --project examples/manim-explainer
npm run render:manim --prefix examples/manim-explainer
node "$PATH_TO_HYPIT" check examples/manim-explainer/runs/render.svrun --project examples/manim-explainer
node "$PATH_TO_HYPIT" plan examples/manim-explainer/runs/render.svrun --project examples/manim-explainer --runtime examples/manim-explainer/hypit.runtime.json
node "$PATH_TO_HYPIT" studio --run examples/manim-explainer/runs/render.svrun --project examples/manim-explainer --runtime examples/manim-explainer/hypit.runtime.json
```

`runs/render.svrun` is the canonical complete-production entry: it targets `final.video` and builds
the presenter, normalization, speech alignment, project component, Film and final rendering from
the current Author Graph. It contains no machine-local Build records, so a fresh checkout follows
the same path as an ordinary Run. Root pnpm installation supplies the repository's Hypit workspace
package to the example component; do not run a separate npm install in this production. The three
Manim renders are reproducible ignored intermediates; the manual preparation above makes them
available to Studio. The automatic Build preparation follows the
[external-file contract](../../skills/hypit/references/creation/project-files.md#prepare-external-files-as-part-of-build). A Build also regenerates the five Seedance
presenter clips and requires configured third-party Provider credentials and accepted spending scope.

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
| Accepted output selection for an iteration | the current Author Graph and `runs/render.svrun` |
| Manim scene content | `manim-scenes/math_block.py`, `manim-scenes/ml_block.py`, `manim-scenes/physics_block.py` |

## Components

`@project/manim-showcase` owns the coordinated card scene. It accepts three opaque Manim videos, the
Canvas, a resolved scene Window and four absolute Instants projected from Script Moments.
The presenter remains a separate Visual Track. Its Surface and Studio integration are documented in the
[component README](packages/manim-showcase/README.md). Film/audio wiring remains in
`authors/main.svml`.

The package registers a Studio Companion for the same `scene` Surface and VisualTrack output. The
Companion supplies a recognizable timeline lane and display title; it does not create a second
rendering path or expose internal HTML and Manim implementation details as author fields.

## External Manim handoff

The external-render and `hypit.buildInputs` contract is defined by the repository's
[Manim authoring skill](../../skills/hypit/references/creation/manim.md) and
[project-file reference](../../skills/hypit/references/creation/project-files.md#prepare-external-files-as-part-of-build).
You can run the same preparation manually with `npm run render:manim --prefix examples/manim-explainer`
when inspecting a scene independently.

The active files are `manim-renders/math_block.mp4`, `manim-renders/ml_block.mp4` and
`manim-renders/physics_block.mp4`. They are separate H.264 `yuv420p` inputs without alpha and are
ignored generated intermediates. The Manim authoring skill defines the verification and import
handoff; the Author Graph normalizes them onto the shared Timeline clock.

The project-local `vectrust.seedance` Endpoint uses the verified Seedance-compatible API at
`https://draw.openai-next.com` and maps this example's `model="standard"` requests to the service's
`doubao-seedance-2-0-260128` model. Store the supplied API key with the command above; it is held by
the selected credential store and is not written to this production.

## Build

```sh
npm run build --prefix examples/manim-explainer/packages/manim-showcase
```

The current production canvas is 720x1280 and its shared Timeline is 30 fps. The component uses the
Timeline frame rate as its sampling timebase rather than requiring 30 fps as a package contract. The
presenter remains full-frame throughout; at `First`, `Next` and `Finally`, the corresponding card
is focused, enlarged and brightened while the other two remain smaller and dimmed. At `These`, all
three return to the small overview arrangement and continue to loop. The native Seedance English
voice is the only narration.
