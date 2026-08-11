---
name: narratage
description: Author, check, plan, build, inspect, and retrieve Narratage/SVML video graphs; configure the cross-platform Node/pnpm/Python runtime; reverse-engineer reference video directly into .svml/.svs/.svrun sources; and apply production playbooks for prompts, continuity, captions, B-roll, overlays, audio, and common video formats. Use for this svml repository, its quickstart, SVML authoring, runtime profiles, VLM reference reconstruction, or video craft decisions. Never use a JSON storyboard as the VLM-to-SVML intermediate.
---

# Narratage

Use this entrypoint for work in the `svml` repository. Keep `.svml` Author Source, `.svrun` Run
Source, and `svml.runtime.json`/`.ts` Runtime Profile separate.

## Route the task

- Environment/setup or API keys → read `references/environment.md` and `references/credentials.md`.
- SVML authoring → read `references/quickstart.md`, then the linked authoritative page under
  `docs/quickstart/`.
- Seedance prompt assembly → read `references/seedance-kits.md`; reuse an official vendored Kit and
  SVS Recipe before writing format scaffolding by hand.
- Production craft or format choice → read `references/playbooks/index.md` and
  `references/playbooks/svml-mapping.md`, then only the relevant craft/format file.
- Reference-video reverse engineering → read `references/reference-vlm.md`; have VLM emit
  `main.svml`, optional `studio.svs`, and `build.svrun` directly, never a JSON storyboard.
- Execution, Runtime control, Build inspection, or output retrieval → read
  `references/runtime.md`; diagnose and start the durable Runtime, `check` Author Source, `plan`
  before paid work, then submit, inspect, and retrieve the Build.

## Required loop

```bash
node --run narratage -- doctor path/to/svml.runtime.json
node --run narratage -- runtime up path/to/svml.runtime.json
node --run narratage -- check path/to/main.svml --package-lock path/to/svml.packages.lock --root .
node --run narratage -- plan path/to/build.svrun --package-lock path/to/svml.packages.lock --root .
node --run narratage -- build path/to/build.svrun --runtime path/to/svml.runtime.json \
  --package-lock path/to/svml.packages.lock --root . --build-id my-build-001 --follow
node --run narratage -- inspect my-build-001 --runtime path/to/svml.runtime.json
node --run narratage -- get my-build-001 --runtime path/to/svml.runtime.json \
  --name final.video --to path/to/output/final.mp4
```

Treat `--follow` as an observer: stopping it does not stop the durable Build. Use `runtime down`
only to stop the Worker and Runtime-owned programs; it does not cancel Builds or remote Provider
work.

Preserve unrelated changes. Keep credentials, generated media, runtime state, and logs out of commits.
The repository's docs remain the syntax authority.
