---
title: Quickstart
description: Install Hypit, compile a complete SVML video graph, and prepare a real Build.
---

# Quickstart

The author writes a narrated Script with semantic anchors, and the compiler assembles generated
video, captions, B-roll, text and audio into a finished film.
Author Sources are written in SVML (Semantic Video Markup Language) and carry the `.svml` extension.

Hypit turns that source into a visible execution graph. Before any model or external service
runs, you can check the source, choose a Run, and inspect the exact work it would require. This
page gets you to that first safe plan: it needs no API keys and makes no paid call.

## Install

```bash
npm install --global hypit
npx skills add hypit-ai/hypit --global
```

The first command installs the reusable Distribution. The second installs the skill globally so a
new agent session in another project can find it. Ordinary authoring never requires a repository
clone.

## Use the Hypit skill

`/hypit` is available from any project directory. Send your agent:

```text
/hypit Set up my environment, ask for only the API keys required by my Runtime Profile, and guide me through authoring and building my first SVML video.
```

It works through the same five steps below, asking you only for what your Runtime Profile actually
needs. Work through them yourself if you would rather not use an agent.

## 1. Check the installed Distribution

You need Node.js 22+ on macOS 13+ or Windows 10/11 x64.

```bash
hypit paths --json
```

The result separates the current project, its `.hypit` state, the machine Program Home and the npm
Distribution. pnpm, Corepack and `npm link` are contributor tools, not user setup.

## 2. Compile the example

The linked example includes a Script, two generated-video requests, speech assembly, WhisperX
alignment, captions, a media Track, text, Film and final rendering.

```bash
cd /path/to/copied-talking-film-graph-check
hypit check main.svml
```

`check` reads the self-described source, loads only its imported packages and prints the public typed
outputs it declares.

Now compile the Run Source:

```bash
hypit plan build.svrun
```

`plan` binds the Author Graph and Run Graph, walks backward from `final.video`, and freezes the
Operations and external Needs that a Build would use. It never starts a Provider.

Open the three source files next:

- [`main.svml`](https://github.com/hypit-ai/hypit/blob/main/examples/talking-film-graph-check/main.svml) — the video;
- [`recipes.svs`](https://github.com/hypit-ai/hypit/blob/main/examples/talking-film-graph-check/recipes.svs) — reusable visual Recipes;
- [`build.svrun`](https://github.com/hypit-ai/hypit/blob/main/examples/talking-film-graph-check/build.svrun) — the requested output.

## 3. Understand the project files

A working video project normally has four authored or configured inputs:

| File | Answers |
|---|---|
| `main.svml` | What video are you making? |
| `recipes.svs` | Which reusable Recipe values does it use? |
| `build.svrun` | Which outputs and Candidates does this Run select? |
| `hypit.runtime.json` | Which credentials, Provider endpoints and services execute it? |

The short form is:

```text
SVML says what.
SVRUN says which.
Runtime Profile says where.
```

One `main.svml` may have many `.svrun` files: generate images, render the film, or reuse approved
shots without changing the authored video.

## 4. Start your own project

Keep project files and generated media outside the installed Hypit Distribution. The global
`hypit` command works from that independent project directory:

```bash
cd /path/to/my-video

hypit runtime use hypit.runtime.json

hypit plan build.svrun
```

A project with `package.json` owns its third-party packages. A plain creative folder needs no Node
project and uses official packages from the installed Distribution. Source and exported files remain in the
project. By default, Build Results live under the project's `.hypit/results`; a project-owned
`hypit.results.json` may point the same complete Result model at S3. Active execution state and
temporary Resources always live under the selected Profile's `dataRoot`.
`runtime use` stores only a local pointer at `.hypit/runtime`. Source imports select author
packages; the Profile independently selects Credential Stores and Endpoints through their own `use` entries.

Start from [`examples/talking-film-live`](https://github.com/hypit-ai/hypit/tree/main/examples/talking-film-live) when you need a
complete Runtime Profile. Copy the source structure, then replace its assets, Script, model choices
and credentials with your own.

## 5. Build and retrieve an output

After reviewing the plan:

```bash
hypit build build.svrun --follow
```

`build` first repeats the same cheap local preflight, then assigns a fresh Build id, stores the Build
and ensures its Worker is available. It never installs a package or starts a Managed Program. Run
`hypit runtime up` explicitly when the selected deployment is not ready. `--follow` is only an
observer; closing it does not stop the Build.

Use `check` while editing a source. Use `doctor` to diagnose a new or broken deployment. They are
safe, but neither is required as a repetitive pre-Build ceremony.

```bash
hypit status <build-id> --watch

hypit activity

hypit get <build-id> \
  --output final.video \
  --to output/final.mp4
```

The Build Result saves every public Author Output completed on the Target route. `get` exports one
exact named Output to the explicit `--to` destination; Targets do not double as a retention list.
A Scalar or Resource becomes a file, while a Composite becomes a directory containing `value.json`
and its referenced Resource files.

## Local tools used by real Builds

Install only what your selected Runtime Profile needs:

| Tool | Needed when |
|---|---|
| `ffmpeg` / `ffprobe` | using local media inspection, normalization or muxing |
| Python 3.10–3.13 and `uv` | using local WhisperX or OpenCV |
| Chromium | managed automatically by local HyperFrames rendering |
| API credentials | selecting remote KIE, Xiaomi or AWS endpoints |

Upstream npm packages are demand-loaded into the shared machine package home shown by `hypit
paths`; they are not copied into every project. `runtime up` prepares the exact npm packages required
by its selected Runtime adapters. When an authored feature needs a package such as one Fontsource
family, the compiler reports the exact repair command:

```bash
hypit packages install @fontsource-variable/inter@5.3.0
```

For local Python programs:

```bash
uv python install 3.13
hypit runtime use hypit.runtime.json
hypit runtime up
```

The Runtime creates a missing managed environment in the machine Program Home and reuses it across
projects and sessions. Do not run a service's `uv sync` from an author project.

Run `hypit doctor hypit.runtime.json` after changing a Runtime Profile or project Result Repository. It reports missing tools,
credentials and endpoint configuration without executing the graph.

## Read next

Follow the authoring path in order, or jump directly to the part you are changing:

| Guide | What you will learn |
|---|---|
| [Script](./quickstart/script.md) | Segments, Role Cues, Dual Text, Selections, Moments and text projections |
| [SVS Stylesheets](./quickstart/styles.md) | Reusable Recipes for captions, media, text and film |
| [Media & Generation](./quickstart/generation.md) | Images, audio, prompt text and explicit model components |
| [Timing & Assembly](./quickstart/timing.md) | Speech Track, WhisperX, ProgramSpace and SemanticMap |
| [Tracks](./quickstart/tracks.md) | Caption, Media, Typography and Audio Tracks |
| [Film & Rendering](./quickstart/composition.md) | Peer Track composition and explicit rendering |
| [Run Source & Builds](./quickstart/run.md) | Targets, reuse, Runtime Profiles, Builds and retrieval |
