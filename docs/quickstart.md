---
title: Quickstart
description: Install Narratage, compile a complete SVML video graph, and prepare a real Build.
---

# Quickstart

The name **Narratage** comes from a 1933 *New York Times* review of the film *The Power and the
Glory*. The critic coined the word to describe a then-new cinematic technique:
**Narration + Montage** — a narrator's voice carries the story forward while the screen assembles
a montage of scenes to match.

That is exactly what this system does. The author writes a narrated Script with semantic anchors,
and the compiler assembles generated video, captions, B-roll, text and audio into a finished film.
Author Sources are written in SVML (Semantic Video Markup Language) and carry the `.svml` extension.

Narratage turns that source into a visible execution graph. Before any model or external service
runs, you can check the source, choose a Run, and inspect the exact work it would require. This
page gets you to that first safe plan: it needs no API keys and makes no paid call.

Everything below starts from a clone of this repository:

```bash
git clone https://github.com/hypit-ai/narratage.git
cd narratage
```

## Use the Narratage skill

`/narratage` is available from that working directory. Send your agent:

```text
/narratage Set up my environment, ask for only the API keys required by my Runtime Profile, and guide me through authoring and building my first SVML video.
```

It works through the same five steps below, asking you only for what your Runtime Profile actually
needs. Work through them yourself if you would rather not use an agent.

## 1. Install the source workspace

You need Node.js 22+ and pnpm 10.33.x through Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
```

If `corepack` is unavailable:

```bash
npm install --global corepack@0.34.5
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
```

`pnpm check` and `pnpm test` are repository-development commands. You do not need to run the full
suite before using the CLI.

## 2. Compile the example

The checked-in example includes a Script, two generated-video requests, speech assembly, WhisperX
alignment, captions, a media Track, text, Film and final rendering.

```bash
node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock
```

`check` reads the self-described source, loads only its locked packages and prints the public typed
outputs it declares.

Now compile the Run Source:

```bash
node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock
```

`plan` binds the Author Graph and Run Graph, walks backward from `final.video`, and freezes the
Operations and external Needs that a Build would use. It never starts a Provider.

Open the three source files next:

- [`main.svml`](https://github.com/hypit-ai/narratage/blob/main/examples/talking-film-graph-check/main.svml) — the video;
- [`studio.svs`](https://github.com/hypit-ai/narratage/blob/main/examples/talking-film-graph-check/studio.svs) — reusable visual Recipes;
- [`build.svrun`](https://github.com/hypit-ai/narratage/blob/main/examples/talking-film-graph-check/build.svrun) — the requested output.

## 3. Understand the project files

A working video project normally has four authored/configured inputs and two generated locks:

| File | Answers |
|---|---|
| `main.svml` | What video are you making? |
| `studio.svs` | Which reusable Recipe values does it use? |
| `build.svrun` | Which outputs and Candidates does this Run select? |
| `svml.runtime.json` | Which machine, stores and Provider endpoints execute it? |
| `svml.packages.lock` | Which author/compute package bytes are allowed? |
| `svml.runtime-packages.lock` | Which privileged Runtime package bytes are allowed? |

The short form is:

```text
SVML says what.
SVRUN says which.
Runtime Profile says where.
```

One `main.svml` may have many `.svrun` files: generate images, render the film, or reuse approved
shots without changing the authored video.

## 4. Start your own project

Keep project files and generated media outside the Narratage repository. Call the checkout's
lightweight `narratage` launcher from your project directory:

```bash
cd /path/to/my-video

/path/to/narratage/narratage packages sync build.svrun \
  --runtime svml.runtime.json

/path/to/narratage/narratage plan build.svrun \
  --runtime svml.runtime.json
```

The launcher uses dependencies installed in the Narratage checkout, but Source, SQLite state,
Artifacts and outputs remain inside your project. `packages sync` adds or refreshes the current
Run and Runtime selections in the two project package inventories; it does not remove another
Run's packages.

Start from [`examples/talking-film-live`](https://github.com/hypit-ai/narratage/tree/main/examples/talking-film-live) when you need a
complete Runtime Profile. Copy the source structure, then replace its assets, Script, model choices
and credentials with your own.

## 5. Build and retrieve an output

After reviewing the plan:

```bash
/path/to/narratage/narratage build build.svrun \
  --runtime svml.runtime.json \
  --build-id my-video-001 \
  --follow
```

`build` stores the Build, ensures its Worker is available, and starts only the external programs
declared by the selected endpoints. `--follow` is an observer; closing it does not stop the Build.

Use `check` while editing a source. Use `doctor` to diagnose a new or broken deployment. They are
safe, but neither is required as a repetitive pre-Build ceremony.

```bash
/path/to/narratage/narratage status my-video-001 \
  --runtime svml.runtime.json

/path/to/narratage/narratage queue \
  --runtime svml.runtime.json --watch

/path/to/narratage/narratage get my-video-001 \
  --runtime svml.runtime.json \
  --name final.video \
  --to output/final.mp4
```

The Runtime archives accepted intermediate Records and media. `get` makes a human-readable copy; it
does not decide whether an intermediate result should have been retained.

## Local tools used by real Builds

Install only what your selected Runtime Profile needs:

| Tool | Needed when |
|---|---|
| `ffmpeg` / `ffprobe` | using local media inspection, normalization or muxing |
| Python 3.10–3.13 and `uv` | using local WhisperX or OpenCV |
| Chromium | managed automatically by local HyperFrames rendering |
| API credentials | selecting remote KIE, Vertex, Xiaomi or AWS endpoints |

For local Python services:

```bash
uv python install 3.13
uv sync --project services/whisperx --frozen
uv sync --project services/image-opencv --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
```

Run `narratage doctor svml.runtime.json` after changing a Runtime Profile. It reports missing tools,
credentials and endpoint configuration without executing the graph.

## Read next

Follow the authoring path in order, or jump directly to the part you are changing:

| Guide | What you will learn |
|---|---|
| [Script](./quickstart/script.md) | Segments, Role Cues, Dual Text, Selections, Moments and text projections |
| [SVS Stylesheets](./quickstart/styles.md) | Reusable Recipes for captions, media, text and film |
| [Media & Generation](./quickstart/generation.md) | Images, audio, prompt text and explicit model components |
| [Timing & Assembly](./quickstart/timing.md) | Speech Spine, WhisperX, ProgramSpace and SemanticMap |
| [Tracks](./quickstart/tracks.md) | Caption, Media, Typography and Audio Tracks |
| [Film & Rendering](./quickstart/composition.md) | Peer Track composition and explicit rendering |
| [Run Source & Builds](./quickstart/run.md) | Targets, reuse, Runtime Profiles, Builds and retrieval |
