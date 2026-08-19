# Reference-video reconstruction route

This route reconstructs a complete reference video as usable `main.svml`, `studio.svs`, and
`build.svrun`. The main agent owns all decisions and source code; Gemini supplies natural-language
visual and audio evidence only.

## What this route delivers, and what it does not

The deliverable is **the components the video needs, the three source files, and the Runtime Profile
that binds what they demand**, and it must be **visible**: the preview check builds every track the
sources declare, so the author can open the Playground and see what was reconstructed. Every
generation the Source declares is declared, not performed: no Build is submitted for the pictures,
and no video generation, speech synthesis, alignment or final render is run. Those belong to a later
step that the author starts deliberately, after reading what was written. What is *not* deferred is
that the declared tracks build — the author should never open the Playground to find that something
delivered cannot be seen.

One exception, because it is not a generation of the video: a component's own surface — the field its
elements are drawn on, whatever that is — is produced while the package is authored, with
`hypit image`, and committed inside the package. `../playbooks/craft/generated-dependencies.md` draws
that line.

Reference observation is part of the work and is expected to cost what it costs.

Write the project into its own directory. If the author named one, use it; otherwise create
`examples/<something>-reverse/` beside the other examples, which the workspace already covers.

## Before the first command

`prepare_reference` and every observation need Vertex credentials, and a project that keeps them in a
`.env` file does not load it automatically. Load it into the environment first:

```bash
set -a && source .env && set +a
```

`../credentials.md` lists which variables each Provider needs.

## Start the evidence before you read

`prepare_reference` and the full `observe_reference` sweep take several minutes and need none of the
knowledge below: their prompts are fixed, and nothing you are about to read changes what they ask.
Start them first and read while they run. Reading first and observing afterwards makes the same run
several minutes longer for nothing.

```bash
hypit-reference-video-tools prepare_reference --video-path <path>          # about a minute
hypit-reference-video-tools observe_reference --reference-id <id>          # run in the background
```

Then read the files below while the sweep is working, and collect its result when you are done.

Before acting on the evidence, read these files completely in order:

1. `workflow.md` — CLI sequence, evidence flow and responsibility boundaries.
2. `continuity.md` — mandatory shot, overlay, B-roll, speaker, product and persistent-system rules.
3. `../playbooks/craft/graphic-compositions.md` — what may be a base picture, when a full screen is
   one authored composition, and where a missing picture comes from.
4. `../playbooks/craft/generated-dependencies.md` — what one generation owes another: the location,
   the split shot, the voice, the first frame, and the stretch too short to be a take.
5. `vocabulary.md` — existing-package selection, appearance-property resolution, and the route for a
   real vocabulary gap.

Two more are required, at the point where they apply rather than now. Reading them here means
reading them half an hour before they matter, with a dozen other files in between:

- `final-sources.md` when the components exist and the sources are about to be written.
- `reconstruction-loop.md` when something has been built and is about to be compared.

Paths above are relative to this file's directory. Do not skip a file because the task looks like a
familiar video format.
