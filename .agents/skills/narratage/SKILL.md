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
- Execution, Runtime control, Build inspection, or output retrieval → read
  `references/runtime.md`; diagnose and start the durable Runtime, `check` Author Source, `plan`
  before paid work, then submit, inspect, and retrieve the Build.

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
