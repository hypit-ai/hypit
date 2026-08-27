---
name: hypit
description: Produce a complete video program from a description — a ranking, a talking head, an explainer, a short — or reconstruct one from a reference video; author, check, preview, build, inspect and retrieve Hypit/SVML projects; configure runtimes and credentials; develop missing project-local author packages; and apply native video production playbooks. Use for making a video with Hypit, the Hypit repository, SVML/SVS/SVRun authoring, reconstruction, package vocabulary, runtime operations, or video craft decisions.
---

# Hypit

**Run the route to the end without stopping.** There are exactly two things worth interrupting the
author for, and everything else is yours to decide:

- **Spending their money.** A Build generates, and generating is billed. Say what it will cost and
  get a yes before submitting one.
- **Which observer reads a reference video, and the credentials it needs.** Vertex or the calling
  agent is a decision about the author's account, and `references/credentials.md` says what each one
  wants. Ask once, at the start. This question belongs to the reconstruction route alone: a program
  authored from a description has no reference, and its pictures are local renders nobody is billed
  to read.

Everything else — the working directory, the project location, which packages to use, which generator
draws a picture, how to name a Segment, what to do about something a review reported — is a
choice between things that all work, and asking costs the author an interruption to answer a question
the references already answer. Decide it and keep going. A run that stops half way with a question is
a run the author has to restart.

Use this file only to route the task. A route file is a sequence of numbered steps, and each step
names the files it needs; read those when you reach that step rather than all of them up front.

Keep `.svml` Author Source, `.svs` Recipe Source, `.svrun` Run Source, and
`hypit.runtime.json` Runtime Profile as separate languages and responsibilities.

Non-negotiable Script rule: every captioned or on-screen spoken passage must be split into short,
complete Cues with `||` in the Script. As the default, cut after roughly 3–4 spoken words (fewer when
the words are long or visually dense); longer runs require an explicit visual reason. Never rely on
renderer line wrapping or a wide Caption box to rescue a long Segment: a Segment without `||` is one
Cue and will overflow the Canvas. Read
`references/script-time.md` and the caption craft before writing Script text; put breaks between
complete Alignment Units, never inside Dual Text.

Every route is resumable. At the start of a route, create the project's
`.hypit/route-state.json`; after any new turn, interruption, or context compaction, read
`references/recovery.md`, inspect that snapshot and reconcile it against the artifacts and checks
before continuing. Never resume from chat memory alone, and never repeat a completed or paid step
without verifying its durable evidence.

Before Source is accepted, every route must complete persisted vocabulary inspection,
`validate_local_author_packages` for every `packages/local-*` package, and
`validate_script_cues` (maximum four visible words per Cue). `preview_check` and the route's final
check repeat these gates even if route-state claims they were completed.

Do not create or hand-author SVG images anywhere in an author project or project-local package.
This includes `.svg` assets, inline `<svg>` markup, and SVG data URLs.

Every route uses a Hypit Distribution and an independent author project. Prefer an installed
machine-wide CLI; when the task is running from a Hypit contributor checkout, use that checkout's
Node entrypoints instead. The npm package is not currently published, so absence of the `hypit`
command is not permission to install it from the registry. `references/environment.md` establishes
the boundary and launcher selection. Read it before the first command of any route.

## Route

- Reference-video reconstruction, reverse engineering, shot/B-roll/overlay analysis, or recreating
  a video as Hypit source → read `references/reconstruction/route.md`. This is the route whatever
  the author calls it — reconstruct, reverse-engineer, recreate, replicate, clone, remake, copy,
  rebuild, or the same idea in any language — and **a video, with or without words around it, is
  this route** even when no verb is given at all. A path to a file and a link to one — TikTok,
  YouTube, Instagram, Bilibili — are the same request; a link is fetched with `yt-dlp` and everything
  after that reads the file. A video with a change attached —
  this one but with our presenter, our product, our brand — is this route too, and the change is made
  on the finished reconstruction. The path is the whole request: the working directory, the project
  location and the vocabulary are yours to decide rather than to ask for.
- Making a video from a description, brief, topic, script or format name, with nothing to copy →
  read `references/original-authoring/route.md`. This is the route whatever shape the request takes —
  "make me a 45-second ranking video", "a talking-head explainer about X", an ad for a product, a
  written script to produce, a topic and a duration, a format named on its own, or the same idea in
  any language — and **a description with no video attached is this route** even when no verb is
  given at all. What it is for, who is in it and what it says are the author's; the working
  directory, the project location, the packages and the generators are yours to decide rather than to
  ask for.
- A sparse or ambiguous original request → read `references/brief-intake.md`. Discover complete
  projects under the checkout's `examples/` directory and analyze their author intent when relevant;
  otherwise use the document's general, open-ended fallback. Do not hard-code video types or skip
  the brief-sufficiency gate.
- A completed project followed by a natural-language change → read `references/revision.md` and use
  the independent `revision_state` route. Restore the element's role in the frozen brief, edit only
  Source/Recipe/Run, invalidate the affected graph closure, and rerun deterministic gates. Revision
  never invokes VLM/observer visual inspection; leave visual inspection for a later Studio session.
- A syntax question about one element, or a source that already exists → read
  `references/authoring.md`, then `references/quickstart.md` and the linked authoritative
  docs/package READMEs. A whole video is `references/original-authoring/route.md`, not this file.
- Which package owns an element, what vocabulary is installed at all, or whether a capability is
  genuinely missing → read `references/vocabulary.md`.
- Creating a new author component → read `references/local-author-package.md`. Both routes reach it
  at the step that proves a vocabulary gap.
- Seeing what the sources produce, or proving the graph traces before any Build → read
  `references/preview.md`.
- Recovering after interruption or context compaction → read `references/recovery.md` before any
  other route step.
- Preview-only media realization, temporary preview Runs, mock Artifact caching, or estimated
  SemanticTake timing → read `references/preview-mock.md`.
- Runtime setup, plan/build/status/inspect/get/reuse → read `references/runtime.md`.
- Environment diagnosis or credentials → read `references/environment.md` and
  `references/credentials.md`.
- Seedance prompt assembly → read `references/seedance-kits.md`.
- Production craft or format selection → read `references/playbooks/index.md` and follow its
  required load order, which names the craft every program needs regardless of format.

Preserve unrelated changes. Keep credentials, generated media, runtime state, and logs out of
commits. Installed package declarations and published docs remain authoritative; repository
maintenance instructions apply only to contributors who deliberately cloned the repository.
