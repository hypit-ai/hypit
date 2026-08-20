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

**That exception covers the component's surface and nothing else.** Every other picture the video
shows — the inner picture of a card, an inserted screenshot, a thumbnail, a product shot, a logo
wall, a phone or monitor's content — is the video's content, and content is **declared in
`main.svml` as a generation**, never produced with `hypit image` into an assets directory and
referenced as a file:

```svml
<copy:Value id="meme-look">A screenshot of a vertical social-media post…</copy:Value>
<gpt:Image id="meme-shot" prompt={meme-look} aspect-ratio="4:5" resolution="2K"/>
```

Writing `<media:Image src="./assets/meme.png"/>` instead spends money this route is not supposed to
spend, and loses the thing that mattered: the prompt. A declared generation carries its own
description in the Source, so it can be reread, corrected and rebuilt; a PNG on disk carries nothing,
and the next person has to invent the prompt again. `media:Image` is for material the author
supplied, not for material you generated a moment ago.

Reference observation is part of the work and is expected to cost what it costs.

## A video path is the whole request

The author gives one thing: the path to a video. Not a working directory, not a project name, not
which packages to use, not where to put the result — those are yours to decide, and asking for them
is asking the author to do your job. Everything this route needs beyond the video path is
discoverable:

- **Where you are.** This skill lives inside the Hypit repository; find its root from the skill's own
  location (the directory containing `package.json` and `packages/`) and work from there. Repository
  paths in these files — `.agents/skills/hypit/scripts/…`, `examples/…` — are relative to that root.
- **Where the project goes.** Its own directory: `examples/<something>-reverse/`, named after the
  video, beside the other examples, which the workspace already covers. Use a directory the author
  named only if they named one.
- **Credentials.** The repository keeps them in `.env`; load it as shown below. If a variable is
  missing, say which one and stop — do not ask the author to describe their setup.

Ask the author about the video and nothing else: what it is for, who is in it, what it should say.
Never interrupt to ask which generator, which package, which directory, or whether to proceed.

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
5. `../playbooks/craft/visual-continuity.md` — recurring anchors as explicit artifacts, one location
   generated once, and the reverse-view geometry that must hold across takes.
6. `../playbooks/craft/production-gates.md` — images and takes generate and are reviewed in rounds,
   and accepted Records are pinned for reuse.
7. `vocabulary.md` — existing-package selection, appearance-property resolution, and the route for a
   real vocabulary gap.

Two more are required, at the point where they apply rather than now. Reading them here means
reading them half an hour before they matter, with a dozen other files in between:

- `final-sources.md` when the components exist and the sources are about to be written.
- `reconstruction-loop.md` when something has been built and is about to be compared.

Paths above are relative to this file's directory. Do not skip a file because the task looks like a
familiar video format.
