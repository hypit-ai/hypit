---
name: narratage
description: Author, check, plan, build, inspect, and retrieve Narratage/SVML video sources; configure the cross-platform Node/pnpm/Python runtime and API keys; reconstruct reference video directly as .svml/.svs/.svrun sources; and apply native SVML production playbooks for prompts, continuity, captions, B-roll, overlays, audio, and common video formats. Use for the Narratage repository, its quickstart, SVML authoring, runtime profiles, reference-video reconstruction, or video craft decisions.
---

# Narratage

Use this entrypoint for work in the `narratage` repository. Keep `.svml` Author Source, `.svrun` Run
Source, and the declarative `svml.runtime.json` Runtime Profile separate.

## Route the task

- Environment/setup or API keys → read `references/environment.md` and `references/credentials.md`.
- SVML authoring → read `references/quickstart.md`, then the linked authoritative page under
  `docs/quickstart/`.
- Seedance prompt assembly → read `references/seedance-kits.md`; reuse an official vendored Kit and
  SVS Recipe before writing format scaffolding by hand.
- Production craft or format choice → read `references/playbooks/index.md`,
  `references/playbooks/craft/production-gates.md`, and
  `references/playbooks/craft/visual-continuity.md`, then the relevant craft/format file.
- Reference-video reconstruction → read `references/reference-vlm.md`; emit `main.svml`, optional
  `studio.svs`, and `build.svrun` directly.
- Showing an author what they have so far → start the SVML Playground and send them the link.
  See "Show the work" below.
- Execution, Runtime control, Build inspection, or output retrieval → read
  `references/runtime.md`; diagnose and start the durable Runtime, `check` Author Source, `plan`
  before paid work, then submit, inspect, and retrieve the Build.

## Show the work

After each step that changes a Source — a Script edit, a Frame moved, a B-roll
placed, a Recipe adjusted — start the Playground and give the author the link.
Reading a diff is not the same as seeing where a cutaway lands.

```bash
pkill -f svml-playground || true          # never leave the old one holding the port
pnpm svml:playground -- --source path/to/main.svml \
  --run path/to/build.svrun \
  --runtime path/to/svml.runtime.json &
# then send the author: http://localhost:5179/
```

Kill the previous server first. A second one silently picks another port, and the
author ends up looking at a stale preview while you describe a new one.

Both extra arguments are optional and each answers one question. `--run` says
which material and which timings to read the Source with. `--runtime` says where
material earlier Builds produced is kept, and is needed only by a Source that
reuses an accepted shot through `<build-record>`; without it that one shot is
refused by name and everything else still draws.

The preview compiles the Source with the real compiler and runs the same
Producers a build runs, so a Source that will not build does not preview. It
needs no build of its own: a directory holding `main.svml` and its `.svs` is
enough.

What it cannot know, it stands in for and says so. Words are placed at an
ordinary delivery pace, except where the Source declares a length — a take that
says it is eight seconds long gets eight seconds of words. A shot nobody has
made shows the picture it names, or a black frame if it names none. Captions
nobody has phrased are cut every few words. Each Track says which of these it is
showing, so say that rather than implying a preview is a render.

Read `docs/guide/svml-playground.md` before explaining what an author is seeing.

## Ordinary loop

```bash
node --run narratage -- plan path/to/build.svrun --runtime path/to/svml.runtime.json
node --run narratage -- build path/to/build.svrun --runtime path/to/svml.runtime.json \
  --build-id my-build-001 --follow
node --run narratage -- inspect my-build-001 --runtime path/to/svml.runtime.json
node --run narratage -- get my-build-001 --runtime path/to/svml.runtime.json \
  --name final.video --to path/to/output/final.mp4
```

Run `packages sync` after import or Runtime package selections change. Use `check` while editing and
`doctor` for deployment setup or diagnosis; do not impose either as ceremony before every Build.

Treat `--follow` as an observer: stopping it does not stop the durable Build. Use `runtime down`
only to stop the Worker and Runtime-owned programs; it does not cancel Builds or remote Provider
work.

Reuse any accepted generated image or take in the next `.svrun` with `build-record` plus `satisfy`,
then review the frozen plan before paid downstream work. Candidate selection has no Pin state or
fidelity label.

Preserve unrelated changes. Keep credentials, generated media, runtime state, and logs out of commits.
The repository's docs remain the syntax authority.
