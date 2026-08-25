---
name: hypit
description: Produce a complete video program from a description — a ranking, a talking head, an explainer, a short — or reconstruct one from a reference video; author, check, preview, build, inspect and retrieve Hypit/SVML projects; configure runtimes and credentials; develop missing project-local author packages; and apply native video production playbooks. Use for making a video with Hypit, the Hypit repository, SVML/SVS/SVRun authoring, reconstruction, package vocabulary, runtime operations, or video craft decisions.
---

# Hypit

**Run the route to the end without stopping.** There are exactly two things worth interrupting the
author for, and everything else is yours to decide:

- **Spending their money.** A Build generates, and generating is billed. Say what it will cost and
  get a yes before submitting one.
- **Which observer reads the reference, and the credentials it needs.** Vertex or the calling agent
  is a decision about the author's account, and `references/credentials.md` says what each one wants.
  Ask once, at the start.

Everything else — the working directory, the project location, which packages to use, which generator
draws a picture, how to name a Segment, what to do about a difference the comparison reported — is a
choice between things that all work, and asking costs the author an interruption to answer a question
the references already answer. Decide it and keep going. A run that stops half way with a question is
a run the author has to restart.

Use this file only to route the task. Read the selected reference completely before acting; when
that reference names required child references, read those completely in the stated order.

Keep `.svml` Author Source, `.svs` Recipe Source, `.svrun` Run Source, and
`hypit.runtime.json` Runtime Profile as separate languages and responsibilities.

Do not create or hand-author SVG images anywhere in an author project or project-local package.
This includes `.svg` assets, inline `<svg>` markup, and SVG data URLs.

Every route uses a Hypit Distribution and an independent author project. Prefer an installed
machine-wide CLI; when the task is running from a Hypit contributor checkout, use that checkout's
Node entrypoints instead. The npm package is not currently published, so absence of the `hypit`
command is not permission to install it from the registry. `references/environment.md` establishes
the boundary and launcher selection. Read it before the first command of any route.

## Route

- Reference-video reconstruction, reverse engineering, shot/B-roll/overlay analysis, or recreating
  a video as Hypit source → read `references/reconstruction/index.md`. This is the route whatever
  the author calls it — reconstruct, reverse-engineer, recreate, replicate, clone, remake, copy,
  rebuild, or the same idea in any language — and **a path to a video file, with or without words
  around it, is this route** even when no verb is given at all. A video path with a change attached —
  this one but with our presenter, our product, our brand — is this route too, and the change is made
  on the finished reconstruction. The path is the whole request: the working directory, the project
  location and the vocabulary are yours to decide rather than to ask for.
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
commits. Installed package declarations and published docs remain authoritative; repository
maintenance instructions apply only to contributors who deliberately cloned the repository.
