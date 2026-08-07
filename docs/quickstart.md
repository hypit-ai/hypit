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

## Check a video graph (free)

The `talking-film-graph-check` example compiles a complete video graph — Script, Seedance, Speech,
WhisperX, Gemini Caption, B-roll, Text, Film, HyperFrames — without calling any external service.

```bash
# Compile the Author Source.
pnpm narratage check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .

# Compile the Run Source and inspect the frozen plan.
pnpm narratage plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

`check` produces the typed Author Graph. `plan` binds the Author and Run graphs, resolves Targets
and outputs the frozen BuildPlan — every Operation and Needs the Scheduler would issue. Inspect it
before spending money.

## Run a real Build (paid)

The `echo-pro-aroll` example is a four-take Seedance Mini talking-head film.

Prerequisites:

- `KIE_API_KEY`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` in env
- `ffmpeg`, `ffprobe`, Chrome
- Local WhisperX service running (see `services/whisperx/README.md`)
- Local assets in `examples/echo-pro-aroll/assets/` (not committed)

```bash
# Diagnose the Runtime environment.
pnpm narratage doctor examples/echo-pro-aroll/svml.runtime.json

# Submit the Build.
pnpm narratage build examples/echo-pro-aroll/build.svrun \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --package-lock examples/echo-pro-aroll/svml.packages.lock \
  --root . \
  --build-id echo-pro-film-001 \
  --follow

# Retrieve the final video.
pnpm narratage get echo-pro-film-001 \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --name final.video \
  --to examples/echo-pro-aroll/output/final.mp4
```

Every accepted intermediate Record and Artifact is archived before the Build completes. `get`
makes an optional copy of an already durable Record.

## Reuse previous results

Narratage has no implicit cache. Reusing a result is explicit Run Graph authoring — declare zero-input
Candidates backed by historical Records and connect them through Satisfaction edges:

```xml
<?svml using="@narratage/run-text@1"?>
<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>

  <build-record id="hook-video"
    build="echo-pro-film-001" output="hook-take.video"/>
  <satisfy output="hook-take.video"
    candidate="hook-video" fidelity="substitute"/>
</svrun>
```

The compiled plan prunes all upstream Operations that the substitute Candidates replace. This is a
new Build, not a continuation.

```bash
pnpm narratage build examples/echo-pro-aroll/reuse-generated.svrun \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --package-lock examples/echo-pro-aroll/svml.packages.lock \
  --root . --build-id echo-pro-film-reuse-001 --follow
```

## CLI reference

```text
narratage lock-packages <lock> --package name [--package name ...] [--root dir]
narratage doctor <runtime.json>
narratage gc <runtime.json> [--apply]
narratage check <source> [--package-lock file] [--root dir]
narratage plan <run-source> [--package-lock file] [--root dir]
narratage build <run-source> --runtime profile [--build-id id] [--follow]
narratage status <build-id> --runtime profile
narratage builds --runtime profile
narratage inspect <build-id> --runtime profile
narratage get <build-id> --runtime profile [--name x|--record x|--output x|--artifact x] [--to path]
narratage cancel <build-id> --runtime profile
```

## Next

- [Development guide](./guide/develop.md) — repository layout, package architecture, extension
  patterns.
