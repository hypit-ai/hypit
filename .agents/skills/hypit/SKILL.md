---
name: hypit
description: Produce a complete video program from a description — a ranking, a talking head, an explainer, a short — or reconstruct one from a reference video; author, check, preview, build, inspect and retrieve Hypit/SVML projects; configure runtimes and credentials; develop missing project-local author packages; and apply native video production playbooks. Use for making a video with Hypit, the Hypit repository, SVML/SVS/SVRun authoring, reconstruction, package vocabulary, runtime operations, or video craft decisions.
---

# Hypit

Use this file only to route the task. Read the selected reference completely before acting; when
that reference names required child references, read those completely in the stated order.

Keep `.svml` Author Source, `.svs` Recipe Source, `.svrun` Run Source, and
`hypit.runtime.json` Runtime Profile as separate languages and responsibilities.

Every route runs against a Hypit checkout. `references/environment.md` finds one, clones it when this
machine has none, and names the directory every path in these files is relative to. Read it before
the first command of any route.

## Route

- Reference-video reconstruction, reverse engineering, shot/B-roll/overlay analysis, or recreating
  a video as Hypit source → read `references/reconstruction/index.md`. This is the route whatever
  the author calls it — reconstruct, reverse-engineer, recreate, replicate, clone, remake, copy,
  rebuild, or the same idea in any language — and **a path to a video file, with or without words
  around it, is this route** even when no verb is given at all. The path is the whole request: the
  working directory, the project location and the vocabulary are yours to decide rather than to ask
  for.
- Making a video from a description, brief, topic, script or format name, with nothing to copy →
  read `references/original-authoring/index.md`. This is the route whatever shape the request takes —
  "make me a 45-second ranking video", "a talking-head explainer about X", an ad for a product, a
  written script to produce, a topic and a duration, a format named on its own, or the same idea in
  any language — and **a description with no video path attached is this route** even when no verb is
  given at all. What it is for, who is in it and what it says are the author's; the working
  directory, the project location, the packages and the generators are yours to decide rather than to
  ask for.
- A syntax question about one element, or a source that already exists → read
  `references/authoring.md`, then `references/quickstart.md` and the linked authoritative
  docs/package READMEs. A whole video is `references/original-authoring/index.md`, not this file.
- Which package owns an element, what vocabulary is installed at all, or whether a capability is
  genuinely missing → read `references/vocabulary.md`.
- Creating a new author component outside reference reconstruction → read
  `references/local-author-package.md`.
- Seeing what the sources produce, or proving the graph traces before any Build → read
  `references/preview.md`.
- Runtime setup, plan/build/status/inspect/get/reuse → read `references/runtime.md`.
- Environment diagnosis or credentials → read `references/environment.md` and
  `references/credentials.md`.
- Seedance prompt assembly → read `references/seedance-kits.md`.
- Production craft or format selection → read `references/playbooks/index.md` and follow its
  required load order. That list is the authority for which craft every program needs; naming a
  subset here is how it goes stale.

Preserve unrelated changes. Keep credentials, generated media, runtime state, and logs out of
commits. Repository docs and package-owned declarations remain authoritative.
