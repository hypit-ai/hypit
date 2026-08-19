---
name: hypit
description: Author, check, plan, build, inspect, and retrieve Hypit/SVML video sources; configure the cross-platform Node/pnpm/Python runtime and API keys; reconstruct reference video directly as .svml/.svs/.svrun sources; and apply native SVML production playbooks for prompts, continuity, captions, B-roll, overlays, audio, and common video formats. Use for the Hypit repository, its quickstart, SVML authoring, runtime profiles, reference-video reconstruction, or video craft decisions.
---

# Hypit

Use this entrypoint for work in the `hypit` repository. Keep `.svml` Author Source, `.svrun` Run
Source, and the declarative `hypit.runtime.json` Runtime Profile separate.

## Route the task

- Environment/setup or API keys → read `references/environment.md` and `references/credentials.md`.
- SVML authoring → read `references/quickstart.md`, then the linked authoritative page under
  `docs/quickstart/`.
- Seedance prompt assembly → read `references/seedance-kits.md`; reuse an official vendored Kit and
  SVS Recipe before writing format scaffolding by hand.
- Production craft or format choice → read `references/playbooks/index.md`,
  `references/playbooks/craft/production-gates.md`, and
  `references/playbooks/craft/visual-continuity.md`, then the relevant craft/format file.
- Reference-video reconstruction → read `references/reference-vlm.md`; use the three reference-video
  CLI commands, then author `main.svml`, `studio.svs`, and `build.svrun` yourself.
- Showing an author what they have so far → start the SVML Playground and send them the link.
  See "Show the work" below.
- Execution, Runtime control, Build inspection, or output retrieval → read
  `references/runtime.md`; diagnose and start the durable Runtime, `check` Author Source, `plan`
  before paid work, then submit, inspect, and retrieve the Build.

## Reference-video reconstruction workflow

When the user asks to reproduce, reverse, reconstruct, or analyze a reference video, this is a
tool-driven task rather than an ordinary hand-authored video task.

1. Read `references/reference-vlm.md` completely.
2. Run the `prepare_reference` CLI command with the local video path.
3. Run the `observe_reference` CLI command for the full reference. It prepares the previous tail frame, previous
   audio tail, whole-reference people, voice, and product context automatically and observes shots
   in parallel.
4. Read every failed or unresolved observation. Run `observe_reference` with a narrow follow-up only
   where evidence conflicts or remains uncertain.
5. Choose the packages needed by the observed video and run `inspect_svml_vocabulary` before
   writing any component, attribute, child, port, or Recipe.
6. Decide whether existing packages can express every observed behavior. Prefer composing existing
   packages when their declared Types, time behavior and outputs are sufficient. If no legal
   composition can express an observation, follow "Develop a missing local component" below before
   writing a tag for it.
7. Write one complete `main.svml`, one `studio.svs`, and one `build.svrun`. Do not write one partial
   SVML fragment per shot and concatenate them.
8. Run the existing `pnpm hypit check` command and repair the package or sources until the project
   is legal.

Gemini is only the eyes and ears. It returns natural-language evidence, never SVML, SVS, SVRun,
component declarations, prompts containing package syntax, or a final structural decision. The
calling agent owns the synthesis and all final files.

The reconstruction invariants are mandatory:

- The person who is speaking owns base; the lowest or largest picture does not.
- Picture ownership and sound ownership are separate. Full-screen B-roll can cover the picture
  while the previous speaker remains the sound owner and base.
- A B-roll person who appears to speak but whose B-roll is silent cannot take over the speaker,
  sound, or base.
- A shot with no visible person can still carry the previous speaker's continuing sound.
- The same overlay continuing across a cut remains one visual track; a cut alone never creates a
  replacement overlay.
- Merge incorrectly split continuous shots only when the observations confirm one shot and the
  combined duration is at most 15 seconds. Three-shot continuity requires explicit evidence too.
- Reuse the full-reference people, voice, and product evidence. Describe a promoted product once;
  do not invent a new product description in every shot.

## Develop a missing local component

This branch is part of reference reconstruction, but it is ordinary Hypit package development, not
a VLM capability. `reference-video-tools` must remain limited to preparation, observation and
vocabulary inspection. Do not add a component generator command to it.

Enter this branch only after comparing the observation against the selected packages' README and
the complete `inspect_svml_vocabulary` result. Prefer a composition of existing components. Do not
force a similar-looking tag to express behavior its declaration does not own, and do not write an
unknown tag into `main.svml` before its package exists.

Before creating the package, read these sources completely:

1. `docs/guide/author-packages.md`
2. `docs/guide/packages.md`
3. `docs/guide/conventions.md`
4. `packages/component-kit/README.md`
5. The README, Manifest, Surface, Component and activation files of the closest existing package

Create one new package under the current project's `packages/local-<slug>/`. The physical and
logical name is `@hypit/local-<slug>`, the physical version is `0.0.0-dev`, and Module identities
use logical version `1`. The package is project-local even when the current project is the Hypit
checkout. Never edit, delete, extend or overwrite an existing package to fill this gap, and never
ask for permission merely to create this new local package once the gap is established.

The main agent, not Gemini, writes the package. Gemini must not receive or produce TypeScript,
`package.json`, Manifest, Surface, Producer, Validator, package syntax or implementation code. Use
its natural-language observation only as evidence for the component's required behavior.

Implement the complete package rather than a syntax stub. Include the package manifest and README,
Module Manifest and Types, every required Producer and Validator, Markup Surface declaration and
decoder, activation contribution, and the necessary lowering, Fragment or render implementation.
Add a preview for a visual Surface. Decide raw versus structured Surface, timing dependencies,
ProgramSpace, Frame, SemanticMap, Artifact, Recipe and output Types from the observed behavior and
the closest package architecture; do not copy a fixed template blindly.

Connect the new package through normal Node package resolution:

- Reuse the current project's workspace configuration when it already includes `packages/*`.
- Otherwise add the smallest `pnpm-workspace.yaml` and package dependency changes that include the
  new package.
- Add the local package as a `workspace:*` dependency where the project's package root can resolve
  it, then run the necessary `pnpm install`.
- Run `pnpm check`, followed by the existing `pnpm hypit check` for `main.svml`, `studio.svs` and
  `build.svrun`. Use `--workspace` or `--package-root` only when the project layout requires them.
- Repair package resolution first, then activation, Manifest/implementation agreement, Surface
  decoding, Producer/Validator behavior, and finally the three project sources.

The package is complete only after the existing checks accept it. Never create a check wrapper.
After the reconstruction is accepted, tell the user that the local package can be moved into the
official Hypit repository as a separate contribution if they want to keep it generally available;
do not perform that promotion automatically.

## Read the package README before writing its syntax

Before writing any element from a package, read that package's README. The import
`@hypit/<name>@1` is `packages/<name>/README.md` — every package that defines SVML elements has
one, and it is the authority on that package's components, attributes, and ports.

Never write a component or attribute you have not seen in that file, and never infer one package's
syntax from another that looks similar. Two packages covering neighboring ground rarely take the
same attributes.

## Ordinary loop

```bash
cd path/to/project
hypit runtime use hypit.runtime.json
hypit plan build.svrun
hypit build build.svrun --follow
hypit inspect <build-id>
hypit get <build-id> \
  --name final.video --to output/final.mp4
```

Install dependencies after import or Runtime package selections change. Use `check` while editing and
`doctor` for deployment setup or diagnosis; do not impose either as ceremony before every Build.

Treat `--follow` as an observer: stopping it does not stop the durable Build. Use `runtime down`
to stop only the Worker; use `programs down` separately when external programs should also stop.
Neither command cancels Builds or remote Provider work.

After submitting without `--follow`, or after leaving an observer, reattach with
`hypit status <build-id> --watch`. A plain `status` remains a one-time snapshot.

Every `build` invocation receives a fresh automatic Build id. Never try to reclaim a prior Build by
restoring Source bytes or choosing an id. Cross-Build reuse exists only through explicit
`build-record` Candidates in a new Run Source.

Reuse any accepted generated image or take in the next `.svrun` with `build-record` plus `satisfy`,
then review the frozen plan before paid downstream work. Candidate selection has no Pin state or
fidelity label.

## Show the work

After each step that changes a Source — a Script edit, a Frame moved, a B-roll placed, a Recipe
adjusted — start the Playground and give the author the link. Reading a diff is not the same as
seeing where a cutaway lands, and a Source draws before any Provider has run: an unmade shot stands
in as the picture it names, held for the length it declares.

```bash
pkill -f svml-playground || true          # never leave the old one holding the port
pnpm svml:playground -- --source path/to/main.svml \
  --run path/to/build.svrun \
  --runtime path/to/hypit.runtime.json &
# then send the author: http://localhost:5179/
```

Kill the previous server first. A second one silently picks another port, and the author ends up
looking at a stale preview while you describe a new one. Pass `--port` only when the author asked to
compare two Sources side by side, and send the port you actually used — read it from the startup
line rather than assuming `5179`.

Both extra arguments are optional and each answers one question. `--run` says which material and
which timings to read the Source with. `--runtime` says where material earlier Builds produced is
kept, and is needed only by a Source that reuses an accepted shot through `<build-record>`; without
it that one shot is refused by name and everything else still draws.

`docs/quickstart/preview.md` is the page to point an author at.

Preserve unrelated changes. Keep credentials, generated media, runtime state, and logs out of commits.
The repository's docs remain the syntax authority.
