---
name: hypit
description: Author, check, preview, build, inspect, and retrieve Hypit/SVML projects; configure runtimes and credentials; reconstruct reference videos; develop missing project-local author packages; and apply native video production playbooks. Use for the Hypit repository, SVML/SVS/SVRun authoring, reference-video reconstruction, package vocabulary, runtime operations, or video craft decisions.
---

# Hypit

Use this file only to route the task. Read the selected reference completely before acting; when
that reference names required child references, read those completely in the stated order.

Keep `.svml` Author Source, `.svs` Recipe Source, `.svrun` Run Source, and
`hypit.runtime.json` Runtime Profile as separate languages and responsibilities.

## Route

- Reference-video reconstruction, reverse engineering, shot/B-roll/overlay analysis, or recreating
  a video as Hypit source → read `references/reference-video/index.md`. This is the route whatever
  the author calls it — reconstruct, reverse-engineer, recreate, replicate, clone, remake, copy,
  rebuild, or the same idea in any language — and **a path to a video file, with or without words
  around it, is this route** even when no verb is given at all. The path is the whole request: the
  working directory, the project location and the vocabulary are yours to decide rather than to ask
  for.
- Ordinary SVML/SVS/SVRun authoring or syntax selection → read `references/authoring.md`, then
  `references/quickstart.md` and the linked authoritative docs/package READMEs.
- Creating a new author component outside reference reconstruction → read
  `references/local-author-package.md`.
- Previewing current Author Source → read `references/preview.md`.
- Runtime setup, plan/build/status/inspect/get/reuse → read `references/runtime.md`.
- Environment diagnosis or credentials → read `references/environment.md` and
  `references/credentials.md`.
- Seedance prompt assembly → read `references/seedance-kits.md`.
- Production craft or format selection → read `references/playbooks/index.md`,
  `references/playbooks/craft/production-gates.md`,
  `references/playbooks/craft/visual-continuity.md`, and the selected craft/format reference.

Preserve unrelated changes. Keep credentials, generated media, runtime state, and logs out of
commits. Repository docs and package-owned declarations remain authoritative.
