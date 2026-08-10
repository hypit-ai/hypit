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
- Production craft or format choice → read `references/playbooks/index.md` and
  `references/playbooks/svml-mapping.md`, then only the relevant craft/format file.
- Reference-video reverse engineering → read `references/reference-vlm.md`; have VLM emit
  `main.svml`, optional `studio.svs`, and `build.svrun` directly, never a JSON storyboard.
- Execution → `check` first, `plan` before paid work, then `build`; inspect and retrieve durable
  outputs afterward.

## Required loop

```bash
pnpm narratage check path/to/main.svml --package-lock path/to/svml.packages.lock --root .
pnpm narratage plan path/to/build.svrun --package-lock path/to/svml.packages.lock --root .
```

Preserve unrelated changes. Keep credentials, generated media, runtime state, and logs out of commits.
The repository's docs remain the syntax authority.
