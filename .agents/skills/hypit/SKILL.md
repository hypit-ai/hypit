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
6. Write one complete `main.svml`, one `studio.svs`, and one `build.svrun`. Do not write one partial
   SVML fragment per shot and concatenate them.
7. Run the existing `pnpm hypit check` command and repair the sources until the project is legal.

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
