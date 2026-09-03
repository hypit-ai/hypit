# Video authoring workflow

Hypit keeps authoring, execution and results separate:

- Source, Recipe and Run describe what should be made.
- Runtime executes one Build from those inputs.
- Result records what that Build actually produced.
- Reference-video tools help an author understand and inspect content; they do not own Build or
  project history.

There is no route database, revision history, recovery cursor or aggregate project state. Work is
recoverable because the authored files and useful media/report files are ordinary project content,
not because a second system reconstructs an agent's past actions.

## Skill installation and execution

`skills/hypit/` is the one real, agent-neutral Skill directory. OpenAgents and other Skill hubs install
that subtree into their Agent's global Skill directory. Repository checkouts expose the same source to
Claude Code and Codex through the two leaf links `.claude/skills/hypit` and `.codex/skills/hypit`; the
parent Skill directories remain independent so either Agent can also have private Skills.

The installed Skill is guidance, not the executable Hypit Distribution. Until the npm package is
published, the Skill selects an existing Hypit checkout or prepares a machine-level checkout at
`<home>/hypit`, updates it only by fast-forwarding `origin/main`, installs its pinned dependencies and
uses its Node entrypoints. A Skill-hub reinstall updates the installed guidance; pulling the checkout
updates the executable Distribution. Neither silently rewrites the other.

The Skill, Distribution and video project have independent locations and lifetimes. A video project
may live anywhere, needs no Skill link, and is never added to the Hypit repository workspace.

## Start from the request

Decide whether the task is original authoring or reconstruction from a reference. Then inspect the
available packages and the public vocabulary they expose:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <package>
hypit-reference-video-tools inspect_visual_schema
```

Reuse an existing Surface when it expresses the requested visual role. Develop a project-local author
package only when there is a real missing capability. Do not mutate an installed package to make one
project pass.

## Original authoring

Write the smallest Source, Recipe and Run that express the request. Inspect them directly:

```bash
hypit-reference-video-tools validate_local_author_packages --run ./build.svrun
hypit-reference-video-tools validate_script_cues --run ./build.svrun
hypit check ./build.svrun
hypit-reference-video-tools preview_check ./build.svrun
hypit-reference-video-tools layout_check --run ./build.svrun
```

These commands are independent reports. One does not approve or unlock another. Fix an actual issue
because the report and the requested design justify the change. A layout candidate may be annotated
as intentional with `layout_accept`; the annotation is keyed by the structural finding name, not by a
snapshot of the whole project.

For a visual review, render the element and window that matter, then read the result against an
explicit statement of intent:

```bash
hypit-reference-video-tools render_element ./build.svrun \
  --element title --segment intro --out ./review/title-intro.mp4
hypit-reference-video-tools review_element --run ./build.svrun \
  --element title --segment intro --video ./review/title-intro.mp4 \
  --intent-file ./review/title-intent.md
```

`authoring_check` can summarize coverage, playback and recorded reviews, but it is not project state
and is not required to submit a Build.

## Reconstruction

Do not inspect repository example projects on this route and never use the supplied reference as a
Film, Track or Take source. Prepare it once as evidence:

```bash
hypit-reference-video-tools prepare_reference --video-path ./reference.mp4 --observer agent
hypit-reference-video-tools observe_reference --reference-id <reference-id>
```

The prepared shot clips, frames, transcript and observations live under
`.hypit/reference-video-tools/`. They are useful source material. `record_observation` fills an
explicit pending observation when the `agent` observer is used.

Author the project from the observed picture, words and timing. Render the element over the same
Script window and compare it directly:

```bash
hypit-reference-video-tools render_element ./build.svrun \
  --element ranking --segment list --reference-id <reference-id> \
  --out ./review/ranking-list.mp4
hypit-reference-video-tools compare_reconstruction \
  --reference-id <reference-id> --run ./build.svrun --segment list \
  --video ./review/ranking-list.mp4 --element ranking
```

Every explicit comparison is a new observation. The tool does not hash a render and silently reuse an
older answer. `reconstruction_check` summarizes what has and has not been looked at; it does not own a
workflow cursor.

## Build and reuse

Run `hypit plan` before paid generation when cost or external services matter. Run `hypit build` only
when the user wants the Build. The Build's public outputs are saved into its Result. Intermediate
component outputs that are public ports are saved as well, so later work can point at useful images,
videos or structured values without changing the Run target into a list of every intermediate value.

Repeated Builds are distinct Results even when the Run files are unchanged. Give important Results
and outputs human names through the Result presentation commands instead of inventing a content hash,
central artifact table or hidden project history.

For bulk variants, use ordinary project directories and an explicit task list chosen by the caller.
Copying, scheduling and naming those projects belongs to that caller or a dedicated batch tool; the
reference-video package does not maintain a second variant state machine.
