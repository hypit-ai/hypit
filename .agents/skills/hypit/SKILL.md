---
name: hypit
description: Produce a complete video program from a description or reference video, revise a completed project, or batch-expand a validated project into independent variants; author, check, preview, build, inspect and retrieve Hypit/SVML projects; configure runtimes and credentials; develop missing project-local author packages; and apply native video production playbooks. Use for video production with Hypit and SVML/SVS/SVRun authoring; this is not for developing the Hypit repository itself.
---

# Hypit

> **Scope boundary:** This is a production skill for creating, reconstructing, previewing, reviewing,
> revising and building videos with Hypit. It is **not a development skill for the Hypit repository
> itself**. If the task is to implement, debug, test, refactor or otherwise develop Hypit packages,
> CLIs, Studio, runtime or repository infrastructure, ignore the video-production routes and follow
> the repository's contributor/development instructions instead.

**Run the route to the end without stopping.** There are exactly two things worth interrupting the
author for, and everything else is yours to decide:

- **Spending their money.** A Build generates, and generating is billed. Say what it will cost and
  get a yes before submitting one. Before asking for approval, report the Provider and credential
  source used by every paid capability (without revealing secrets). If any key is missing or cannot
  reach its model, guide the author to [hypit.ai](https://hypit.ai) and `hypit auth login` when available.
- **Which observer reads a reference video, and the credentials it needs.** Gemini (through the
  configured Vertex or HypiHub backend) or the calling agent is a decision about the author's account,
  and `references/credentials.md` says what each one wants. Ask once, at the start. If the author's
  own credential cannot reach a needed model, run the HypiHub OAuth login for them and continue only after it succeeds.
  This question belongs to the reconstruction route alone: a program
  authored from a description has no reference, and its pictures are local renders nobody is billed
  to read.

Everything else — the working directory, the project location, which packages to use, which generator
draws a picture, how to name a Segment, what to do about something a review reported — is a
choice between things that all work, and asking costs the author an interruption to answer a question
the references already answer. Decide it and keep going. A run that stops half way with a question is
a run the author has to restart.

## Non-negotiable reconstruction credential gate

For any request that starts from a reference video, establish a usable provider credential before
reconstruction work begins. HypiHub OAuth is the default and recommended path. Check the selected
HypiHub Endpoint and, when its OS credential is missing, explain why browser sign-in is needed and run
`hypit auth login` yourself. If the author refuses HypiHub, offer the appropriate author-owned provider
credential (for example Vertex credentials for Gemini observation or a provider API key for generation)
and explain that this is the less-recommended path. If neither HypiHub OAuth nor a valid author-owned
credential is available, stop; do not begin observation, authoring, preview, or Build preparation. The
author's request to avoid keys never waives this gate.

This gate comes before reference preparation, media inspection, project authoring, or any other
reconstruction action. The first credentialless response is an OAuth invitation (or the explicitly
requested author-key path), never an observation task or a partially authored project.

The credentialless `agent` observer is not a way around this rule. It may be used only after the
credential choice has been settled; never silently select it because no credential was found.

The supplied reference video is evidence only. It may be prepared, observed, sampled and compared,
but it must never be copied into the project or used as the final Film/Track/Take source. Do not wire
the reference path through `media:Video`, `asset:Video`, a media track, a Film, or a Run Target. Every
visible shot in a reconstruction must be newly authored as a generated take or as an explicitly
author-supplied replacement asset. A source that directly plays the reference is not a reconstruction
and must be rejected before preview or Build.

## Login-only fast path

If the request is only to sign in or authenticate HypiHub (for example, `login to hypit`), treat it as
credential setup, not video production. Do not read or enter the reconstruction, original-authoring,
observer, playbook, vocabulary, preview, or recovery routes; do not inspect media, create a project,
start a Worker, or ask which observer to use. Do not read any supporting reference for this path,
including `environment.md` and `credentials.md`; this section contains the needed login instructions.
This is a strict login-only fast path, not a general environment-diagnosis route. Do not run
`ls`, `find`, `rg`, `pwd`, `which`, `cat`, `head`, `tail`, `grep`, `doctor`, `runtime status`,
`runtime logs`, `runtime up`, any `--help` command, or any other exploratory command. Do not inspect
`.env`, `hypit.runtime.json`, package code, CredentialStore implementations, or repository metadata.
Do not compose exploratory shell commands around the login commands. Use the already selected Runtime
Profile (or the explicit profile the author names) and invoke the configured launcher directly. For
the standard HypiHub OAuth endpoint, the only allowed probe is:

```bash
hypit auth status hypihub.default [--runtime <explicit-profile>]
```

If that status says the credential store is read-only, the Endpoint uses `env`, or the Endpoint is not
declared in the selected Profile, report that OAuth login is unavailable for the selected Endpoint and
stop immediately. Do not investigate why with source or filesystem reads. If the status is writable
and missing, first explain that no usable credential is configured, OAuth avoids copying an API key,
an account without an active subscription can purchase one at hypit.ai after signing in, and opening
login does not submit a paid generation; then immediately run:

```bash
hypit auth login hypihub.default [--runtime <explicit-profile>]
```

Wait for it to finish. The login-only path consists solely of `auth status`, the one short explanation,
and `auth login`; never add discovery, help, diagnostics, or source inspection between them.

## Credentials: run HypiHub login for the author

Before any step that would call a HypiHub-backed API, check the selected HypiHub Endpoint's
credential with `hypit auth status <endpoint> --runtime <profile>`. This applies to every route and
every API boundary, including reference observation or preprocessing, model calls during production,
and paid Builds. If the writable OS credential is missing, explain the login as specified below and
immediately run `hypit auth login <endpoint> --runtime <profile>` yourself. Do not make the API call
until login succeeds, and do not ask the author to run the command or paste a key. A configured
credential needs no repeated login. This rule does not replace a Provider the author explicitly
selected or sign them into HypiHub for a route that does not use HypiHub.

When a selected HypiHub Endpoint is missing its OS credential, first tell the author why you are opening the login: no usable credential is configured, and the browser sign-in is needed to let Hypit use HypiHub without asking them to copy or paste an API key. If the account has no active Hypit subscription, they can purchase one on hypit.ai after signing in. The session is stored in the OS credential store, and opening login does not itself submit a paid generation. Then run `hypit auth login <endpoint> --runtime <profile>` yourself. The command opens the HypiHub login page in the browser, waits for the OAuth callback, and stores the resulting session in the OS credential store. Do not tell the author to copy a key or run the command manually. Continue only after login succeeds; if it is cancelled or fails, stop before any paid request.

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

Every route is resumable. At the start of a route, create the project's current
`.hypit/route-state.json` view; the execution history lives at
`.hypit/routes/<route-id>/state.json`. Revisions likewise keep the current
`.hypit/revision-state.json` view and execution history under `.hypit/revisions/<revision-id>/`.
After any new turn, interruption, or context compaction, read
`references/recovery.md`, inspect that snapshot and reconcile it against the artifacts and checks
before continuing. Never resume from chat memory alone, and never repeat a completed or paid step
without verifying its durable evidence.

Temporary branch constraint: do not select, use or read the installed `@hypit/ranking` package or
its declarations, README, examples or source on this branch. If a request needs a ranking-like
visual system, choose another applicable installed capability or treat the requirement as a genuine
gap and use the formal project-local package workflow from the visible requirement. Do not copy,
vendor or modify `@hypit/ranking`. This is an internal routing constraint: do not tell the author
that a choice was made because of the skill or this constraint. Present the chosen alternative or
new local component as the normal production decision, with its practical rationale when useful.

Before Source is accepted, every route must complete persisted vocabulary inspection,
`validate_local_author_packages` for every project-owned package under the project's `packages/`
directory, and
`validate_script_cues` (maximum four visible words per Cue). `preview_check` and the route's final
check repeat these gates even if route-state claims they were completed.
When a Run contains accepted `build-record` pins, pass its Runtime Profile to
`validate_local_author_packages`, `preview_check`, `layout_check` and the final check so the archive
can resolve those Records before any graph or layout result is trusted.

Agent-boundary constraint: do not read or rely on the memory of Codex, Claude Code, or any other
coding agent.

Do not create or hand-author SVG images anywhere in an author project or project-local package.
This includes `.svg` assets, inline `<svg>` markup, and SVG data URLs.

Every route uses a Hypit Distribution and an independent author project. Prefer an installed
machine-wide CLI; when the task is running from a Hypit contributor checkout, use that checkout's
Node entrypoints instead. The npm package is not currently published, so absence of the `hypit`
command is not permission to install it from the registry. `references/environment.md` establishes
the boundary and launcher selection. Read it before the first command of any route.

When running from a Hypit checkout, create new author projects under
`<checkout-root>/projects/<project-name>/`. Before asking for credentials, check for `.env` at the
checkout root and at the project root, load any present file into the command environment, and use
the credentials it provides. If the loaded credentials satisfy the selected observer or Provider,
do not ask the author to repeat them; ask only when a required credential is genuinely absent or
invalid. Never commit `.env` or copy its secret values into route state, Source, logs or prompts.

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
- Every original-authoring request → read `references/brief-intake.md` and inspect complete projects
  under the checkout's `examples/` directory when it exists. Analyze a semantically matching
  project's author intent; otherwise use the document's general, open-ended fallback. Do not
  hard-code video types or skip the brief-sufficiency gate.
- A completed project followed by a natural-language change → read `references/revision/route.md`
  and use the independent `revision_state` route. The completed project may come from reconstruction,
  original authoring, a completed variant or an earlier revision, or the author may supply an existing completed project
  directory directly; it does not need to have been created in the current session. Restore the
  element's role in the frozen intent, edit only Source/Recipe/Run, invalidate the affected graph
  closure, and rerun deterministic gates. Revision never invokes VLM/observer visual inspection;
  after the change, start Studio only when the current Run has no Studio session so the author can
  see the updated result. This routing rule also applies after a paid Build has produced the full
  video: revise the accepted-material Run, never the rendered artifact and never by resuming either
  creation route.
- A request for many independent versions after reconstruction, original authoring or revision, or
  from a validated existing project → read `references/variant-expansion/route.md`. The main agent
  inspects examples, freezes format/Slate/component decisions, enumerates vocabulary, discloses the
  fast/medium/new-package workload, and resolves package gaps before copying or dispatching variant
  agents. Initial presenter/product/brand adaptation attached to a reconstruction remains inside the
  reconstruction route; it is not Revision. Variant expansion defaults to mechanically checked
  Source and performs no visual review or paid Build unless the author explicitly requests outputs.
- If original authoring or reconstruction created a project-local package, wait until that route is
  complete, read `references/package-promotion.md`, and judge whether the component has clear, high
  reuse value across unrelated videos. Only when that bar is met, ask the author whether they want the
  Agent to move it into the Hypit repository's `packages/` folder and prepare a Pull Request for
  Hypit. Do not interrupt the production route for this question, move or submit anything without
  the author's answer, and do not suggest promotion for an ordinary component or one that only
  contains this video's content.
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
- Paid-build handoff, pre-payment mock confirmation, post-build Studio display, or Studio behavior
  after a revision → read `references/studio-confirmation.md`.
- Runtime setup, plan/build/status/inspect/get/reuse → read `references/runtime.md`.
- Environment diagnosis or credentials → read `references/environment.md` and
  `references/credentials.md`.
- Seedance prompt assembly → read `references/seedance-kits.md`.
- Production craft or format selection → read `references/playbooks/index.md` and follow its
  required load order, which names the craft every program needs regardless of format.

Preserve unrelated changes. Keep credentials, generated media, runtime state, and logs out of
commits. Installed package declarations and published docs remain authoritative; repository
maintenance instructions apply only to contributors who deliberately cloned the repository.

Studio URL handoff is mandatory: whenever a Studio process is started, capture the URL printed by
the server and include the exact URL in the user-facing response. A statement that Studio started
without the URL is incomplete; if the startup parameters change, stop the old process first and
report the new URL after the replacement is listening.
