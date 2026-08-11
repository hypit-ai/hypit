---
title: Quickstart
description: Set up Narratage and compile your first video graph.
---

# Quickstart

## Choose your path

**Use the Narratage skill.** Install the complete
[`narratage` skill folder](https://github.com/cashdiffusion/svml/tree/main/.agents/skills/narratage)
with your agent's standard skill installer, or send that link to the agent and ask it to install and
use the skill. If you already cloned the repository, point the installer at
`.agents/skills/narratage`; install the whole folder, not only `SKILL.md`.

```text
Install and use the narratage skill from this repository. Set up my environment, ask for only the
API keys required by my Runtime Profile, and guide me through authoring and building my first SVML
video.
```

Codex and Claude sessions opened in this checkout can discover the canonical skill through the
checked-in `.codex/skills` and `.claude/skills` links. If a Windows checkout does not preserve
symlinks, give the agent `.agents/skills/narratage` directly. Once the skill is active, the agent
loads the relevant Quickstart pages for you, so you do not need to read the rest of this guide
manually.

**Continue manually.** Start with [Install](#install), then follow the seven guides in order.

The name **Narratage** comes from a 1933 *New York Times* review of the film *The Power and the
Glory*. The critic coined the word to describe a then-new cinematic technique:
**Narration + Montage** — a narrator's voice carries the story forward while the screen assembles
a montage of scenes to match.

That is exactly what this system does. The author writes a narrated Script with semantic anchors,
and the compiler assembles generated video, captions, B-roll, text and audio into a finished film.
Author Sources are written in SVML (Semantic Video Markup Language) and carry the `.svml`
extension; development packages in this workspace reserve the `@narratage` scope. They have not
been published to npm yet.

## Install

The source workspace requires Node.js 22+ and pnpm 10.33.x through Corepack. These commands are the
same in macOS/Linux shells and Windows PowerShell. The ordinary CLI examples use Node's built-in
script runner so each command does not launch pnpm again.

Some newer Node.js distributions do not bundle Corepack. If `corepack --version` is unavailable,
install a compatible release first from either shell:

```text
npm install --global corepack@0.34.5
```

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

Local media work also requires `ffmpeg` and `ffprobe` on `PATH`. Python is optional: install Python
3.10–3.13 and [`uv`](https://docs.astral.sh/uv/) only when the Runtime Profile selects local
WhisperX or OpenCV. Prepare the locked environments from either shell with:

```text
uv python install 3.13
uv sync --project services/whisperx --frozen
uv sync --project services/image-opencv --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
```

Inside the source checkout, commands use `node --run narratage -- ...`. A project outside this
repository uses `/path/to/svml/narratage ...` plus `--package-root /path/to/svml`; the checked-in
launcher starts the same CLI directly without pnpm, and all project state stays under that external
project's Runtime Profile root.

## Three inputs

Every Build takes three separate inputs:

| Input | What it owns | Typical file |
|---|---|---|
| **Author Source** | script, model choices, track composition, output graph | `.svml` |
| **Run Source** | which outputs to target, alternate candidates, satisfaction edges | `.svrun` |
| **Runtime Profile** | endpoints, credentials, concurrency, permissions | `svml.runtime.json` |

Author Source says *what*. Run Source says *which*. Runtime Profile says *where*.

## Your first graph check

The `talking-film-graph-check` example compiles a complete video graph — Script, Seedance, Speech,
WhisperX, Gemini Caption, Media Track, Text, Film, HyperFrames — without calling any external service.

```bash
node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

`check` produces the typed Author Graph. `plan` binds the Author and Run graphs, resolves Targets
and outputs the frozen BuildPlan — every Operation and Needs the Scheduler would issue. Inspect it
before spending money.

## Guide contents

| Guide | Topic |
|---|---|
| [Script](./quickstart/script.md) | Segments, Role Cues, Dual Text, Selections, Moments, text projections |
| [SVS Stylesheets](./quickstart/styles.md) | CSS-like Recipes for film, caption, B-roll, text, speech and fonts |
| [Media & Generation](./quickstart/generation.md) | media:Image, media:Audio, estimate:Speech, Text Templates, Seedance |
| [Timing & Assembly](./quickstart/timing.md) | speech:Spine, whisperx:Alignment, ProgramSpace, SemanticMap |
| [Caption, Media, Text & Audio](./quickstart/tracks.md) | Caption, Media, Typography and Audio Track authoring |
| [Film & Rendering](./quickstart/composition.md) | film:Film, render:Video, full pipeline walkthrough |
| [Run Source & Builds](./quickstart/run.md) | .svrun syntax, targets, reuse, runtime profile, build workflow |
