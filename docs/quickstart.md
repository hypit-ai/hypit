---
title: Quickstart
description: Set up Narratage and compile your first video graph.
---

# Quickstart

The name **Narratage** comes from a 1933 *New York Times* review of the film *The Power and the
Glory*. The critic coined the word to describe a then-new cinematic technique:
**Narration + Montage** — a narrator's voice carries the story forward while the screen assembles
a montage of scenes to match.

That is exactly what this system does. The author writes a narrated Script with semantic anchors,
and the compiler assembles generated video, captions, B-roll, text and audio into a finished film.
Author Sources are written in SVML (Semantic Video Markup Language) and carry the `.svml`
extension; the workspace packages are published under the `@narratage` scope.

## Install

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm check
pnpm test
```

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
WhisperX, Gemini Caption, B-roll, Text, Film, HyperFrames — without calling any external service.

```bash
pnpm narratage check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

pnpm narratage plan examples/talking-film-graph-check/build.svrun \
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
| [Media & Generation](./quickstart/generation.md) | media:Image, media:Audio, estimate:Speech, Seedance, speaker:Take |
| [Timing & Assembly](./quickstart/timing.md) | speech:Spine, whisperx:Alignment, ProgramSpace, SemanticMap |
| [Caption, B-roll & Text](./quickstart/tracks.md) | caption:Style/Program/Planner/Track, broll:Track, text:Track |
| [Film & Rendering](./quickstart/composition.md) | film:Film, render:Video, full pipeline walkthrough |
| [Run Source & Builds](./quickstart/run.md) | .svrun syntax, targets, reuse, runtime profile, build workflow |

## Next

- [Development guide](./guide/develop.md) — repository layout, package architecture, extension
  patterns.
