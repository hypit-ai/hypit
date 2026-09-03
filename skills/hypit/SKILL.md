---
name: hypit
description: Produce a complete video program from a description or reference video, revise a completed project, or create independent variants; author, inspect, preview, build and retrieve Hypit/SVML projects; configure runtimes and credentials; develop missing project-local author packages; and apply native video production playbooks. Use for video production with Hypit and SVML/SVS/SVRun authoring; this is not for developing the Hypit repository itself.
---

# Hypit

> **Scope boundary:** This is a production skill. When the task is to implement, debug, test or
> refactor the Hypit repository itself, do not use this production workflow.

Complete the production task without asking the author to choose routine implementation details.
Interrupt only for an action that spends their money, for genuinely missing credentials, or for the
choice of observer that will read a reference video.

Before a paid Build, run `hypit plan`, state the estimated cost and the selected Provider/credential
source without exposing secrets, and obtain approval. A Build is never an implicit consequence of a
preview, inspection or review command.

## Project model

Keep these separate:

- `.svml` Author Source describes the program;
- `.svs` Recipe Source describes generation choices;
- `.svrun` Run Source binds one executable request;
- `hypit.runtime.json` selects external execution facilities;
- a Build is one execution;
- a Result is the project-owned record of what that Build produced.

Do not create route state, revision state, recovery cursors, content-addressed evidence directories or
aggregate approval state. Continue from the files that actually exist in the project. A reference
observation, render, comparison, layout report or Result is useful content; it is not proof that an
agent completed an abstract stage.

Do not repeat a paid Build just because conversation context was compacted. Inspect the Run and its
Results directly. If a Result exists, use it. If execution is still active, use Runtime status. If
there is no Result and no active Build, ask before submitting a new paid Build.

Once the active project boundary is selected, read and modify only that project's Sources, assets,
Runtime Profile, state, outputs and `packages/` directory. Never borrow, copy or link a local package
from another author project. Use an official package from the selected Distribution or create the
missing component inside the active project. Distribution examples are read-only inspiration for
original authoring; reconstruction must follow the supplied reference evidence and must not inspect or
reuse an example project. A reference video is evidence, never a Film/Track/Take source or final output.

## Environment and credentials

Installing this Skill and installing the executable Hypit Distribution are separate operations. A
Skill hub such as OpenAgents copies the real `skills/hypit/` directory into an Agent's global Skill
directory; it does not install the CLI. The repository's `.claude/skills/hypit` and
`.codex/skills/hypit` entries are only contributor-facing leaf links to that same source directory.

Use an installed machine-wide CLI when available. Until the npm package is published, otherwise use a
machine-level checkout at `<home>/hypit`: clone `https://github.com/hypit-ai/hypit.git` there when it
does not exist, fast-forward it from `origin/main` once per conversation, install its pinned workspace
dependencies, and invoke its Node entrypoints. Never overwrite a different directory, reset local
changes, or update the installed Skill as a side effect; OpenAgents or the user's Skill installer owns
that installed copy.

The Distribution checkout and every author project are independent. Keep the checkout at
`<home>/hypit` and create or use the video project wherever the author requested; never require one to
contain the other and never add per-project Skill links. Read `references/environment.md` before the
first production command and `references/credentials.md` when credentials are involved.

Load an existing Distribution-root or project-root `.env` for commands, but never commit it or copy
secrets into Source, reports or prompts.

For a login-only request, do no project discovery. Use only:

```bash
hypit auth status hypihub.default [--runtime <explicit-profile>]
hypit auth login hypihub.default [--runtime <explicit-profile>]
```

Run login only when status says the selected credential store is writable and the credential is
missing. Explain that browser sign-in stores a session in the OS credential store and does not submit
a paid generation.

## Authoring rules

Every captioned or on-screen spoken passage must use short complete Cues separated by `||`. Default to
roughly 3–4 spoken words per Cue, fewer for dense words. Read `references/script-time.md` and the
caption craft before writing Script text.

Never rely on renderer wrapping to rescue a long Cue. Never hand-author SVG files, inline SVG or SVG
data URLs in an author project or project-local package. Never modify an installed package for one
project; use another public Surface or create a project-local package for a real capability gap.

The temporary `@hypit/ranking` branch restriction remains: do not select, read or use that installed
package. Use another applicable capability or develop a project-local alternative.

## Direct inspection

The reference-video commands are independent tools, not ordered stages:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <package>
hypit-reference-video-tools inspect_visual_schema
hypit-reference-video-tools validate_local_author_packages --run <build.svrun>
hypit-reference-video-tools validate_script_cues --run <build.svrun>
hypit check <build.svrun>
hypit-reference-video-tools preview_check <build.svrun>
hypit-reference-video-tools layout_check --run <build.svrun>
```

Use the reports that answer the current question. A report does not unlock another command. Layout
measurements are advisory; repair a genuine issue or record an intentional structural finding with
`layout_accept` and a reason.

When a Run contains accepted `build-record` pins, pass its Runtime Profile to commands that must read
those Results.

## Task routing

- Reference video, link, reconstruction or reverse engineering: read
  `references/reconstruction/route.md` and `references/reconstruction/observers.md`. Do not inspect
  Distribution examples on this route; the reference itself is authoritative.
- Description, topic, script or format with no reference video: read
  `references/original-authoring/route.md` and `references/brief-intake.md`.
- A natural-language change to an existing completed project: read `references/revision/route.md`.
  Edit Source/Recipe/Run, never rendered media.
- Many independent versions: create ordinary independent project directories from the accepted source
  project and keep an explicit human-readable task list. Do not construct a second project history or
  variant state machine. Paid Builds remain individually approved.
- Package discovery or a possible capability gap: read `references/vocabulary.md`.
- A new author component: read `references/local-author-package.md`.
- Preview or visual inspection: read `references/preview.md`, `references/preview-mock.md`,
  `references/element-review.md` and `references/layout-checks.md` as needed.
- Runtime setup, Build, status, Result inspection and reuse: read `references/runtime.md`.
- Studio handoff: read `references/studio-confirmation.md`.
- Production craft: read `references/playbooks/index.md` and its required craft references.

If a project-local component has clear reuse value across unrelated videos, finish the current video
first, then read `references/package-promotion.md` and ask before moving it into the Hypit repository.

Preserve unrelated changes. Keep credentials, generated media, Runtime state and logs out of commits.
Whenever Studio is started, report the exact URL printed by the server.
