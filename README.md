# Narratage

> Write the story. Compile the video.

Narratage is a semantic, graph-native system for making AI video. You write the story, choose the
models and visual components, and state which outputs you want. Narratage turns that intent into a
finite execution plan, runs only the work the result depends on, and keeps every accepted output
available for later Runs.

SVML is the authoring language. Narratage is the compiler, runtime and package ecosystem around it.

[Documentation](https://narratage.hypit.ai/) ·
[中文文档](https://narratage.hypit.ai/zh/) ·
[Quickstart](https://narratage.hypit.ai/quickstart) ·
[Examples](./examples/README.md)

Narratage currently runs from a source checkout. The npm packages and CLI have not been published
yet.

## What it feels like

The Script remains readable prose. Semantic anchors live beside the words they describe; generation,
timing, captions and composition refer back to that meaning.

```svml
<script id="story">
  <opening>
    <HOST>Meaning @demo becomes the source @/demo.</opening>
</script>

<seedance:TextVideo id="take"
  model="mini"
  prompt={direction}
  duration="5"
  generate-audio="true"/>

<whisperx:Alignment id="timing"
  narrative={story}
  audio={speech.audio}/>

<media-track:Item
  video={motion.video}
  during={story.selection.demo}
  frame={card-frame}/>

<film:Film id="main" canvas={vertical} space={speech.space}>
  <film:Track source={speech.visual}/>
  <film:Track source={cards.visual}/>
  <film:Track source={captions.track}/>
</film:Film>
```

This is an excerpt from the complete, checkable
[`talking-film-graph-check`](./examples/talking-film-graph-check/main.svml) example. Namespaced
elements are supplied by imported packages; the language does not hard-code Seedance, WhisperX,
Caption or Film into its Core.

## Try it without API keys

You need Node.js 22+ and pnpm 10.33.x. These commands install the source workspace and compile a
complete video graph without starting a Provider or making a paid request:

```bash
git clone https://github.com/hypit-ai/narratage.git
cd narratage
corepack enable
pnpm install --frozen-lockfile

node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock \
  --root .

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock \
  --root .
```

`check` verifies the Author Source and prints its typed outputs. `plan` shows the exact demanded
subgraph and every external capability a real Build would need. Planning never starts external work.

See the [Quickstart](./docs/quickstart.md) if Corepack is unavailable or you want to run local media,
WhisperX, OpenCV or HyperFrames.

## The files you control

| File | Purpose |
|---|---|
| `main.svml` | The video: Script, chosen models, Tracks and Composition |
| `studio.svs` | Optional reusable visual and prompt Recipes imported by the Author Source |
| `build.svrun` | The outputs required for one Run, including explicit reuse or alternate Candidates |
| `svml.runtime.json` | The machine environment: stores, endpoints, credentials and concurrency |
| `svml.packages.lock` | Generated lock for author and compute packages |
| `svml.runtime-packages.lock` | Generated lock for Runtime and Provider packages |

The boundaries are deliberate:

- SVML says what the author means and explicitly chooses model families where that choice matters.
- SVRUN says what this Run should produce and which compatible results should satisfy its outputs.
- The Runtime Profile says where those operations execute.
- Providers translate exact capability requests into local programs or remote APIs. They do not
  reinterpret the author's creative choice.

## From source to output

```text
main.svml + studio.svs
          │
          ▼
      Author Graph  ◀──── build.svrun selects Targets and Candidates
          │
          ▼
     frozen BuildPlan    no external work has started yet
          │
          ▼
 Runtime Profile ─────── Worker, Stores and exact Provider Endpoints
          │
          ▼
 accepted Records ────── inspect, reuse, or materialize with `get`
```

There is no privileged “final video” root. A Run can target a generated image, a transcript map, a
Track, or the completed video. The compiler follows dependencies backward from those Targets and
does not schedule unrelated work.

## Run a real project

Keep video projects outside the Narratage checkout. During source development, call the checkout's
lightweight launcher from the project directory:

```bash
cd /path/to/my-video

/path/to/narratage/narratage packages sync build.svrun \
  --runtime svml.runtime.json --root .

/path/to/narratage/narratage doctor svml.runtime.json
/path/to/narratage/narratage check main.svml \
  --runtime svml.runtime.json --root .
/path/to/narratage/narratage plan build.svrun \
  --runtime svml.runtime.json --root .

/path/to/narratage/narratage build build.svrun \
  --runtime svml.runtime.json \
  --build-id my-video-001 \
  --follow

/path/to/narratage/narratage get my-video-001 \
  --runtime svml.runtime.json \
  --name final.video \
  --to output/final.mp4
```

`build` submits durable work and ensures the selected Worker is available. `--follow` only observes
that Build; closing the observer does not cancel it. Use `status`, `queue`, `operations` and
`inspect` to see what is happening.

Read [Run Source & Builds](./docs/quickstart/run.md) before the first paid Build. It covers Runtime
Profiles, credentials, concurrency, cancellation and explicit reuse of previous outputs.

## Why a graph language

AI generation is slow, costly, fallible and non-deterministic. Its outputs often become the next
step's inputs. A linear script or hidden workflow runner cannot clearly answer all of these questions:

- What did the author request?
- Which result is required right now?
- Which implementation and Provider will produce it?
- Which earlier image or video should be reused deliberately?
- What can run in parallel, and what is waiting on an upstream result?
- What actually produced the accepted output?

Narratage makes those choices visible as two peer graphs: the Author Graph expresses the work, and
the Run Graph selects Targets and realizations for one Build. Core only resolves, verifies and
advances the resulting state machine; video concepts remain in independently installable packages.

For the full model, read [Architecture](./docs/architecture.md). For the small normative laws, read
the [Core Kernel specification](./spec/core-kernel.md).

## Extend it without changing Core

Packages may independently contribute:

- an author-facing Surface and its graph lowering;
- a typed contract shared with other packages;
- a deterministic compute operation;
- a local or remote Provider endpoint;
- a Scheduler, credential store or Artifact store implementation.

Core has no central list of video models, Tracks or Providers. Installed packages communicate through
nominal types and explicit graph edges.

Choose the guide that matches your work:

- [Author a video](./docs/quickstart.md)
- [Understand package boundaries](./docs/guide/packages.md)
- [Add an author package](./docs/guide/author-packages.md)
- [Add a Provider](./docs/guide/providers.md)
- [Configure a Runtime Profile](./docs/guide/runtime-profile.md)
- [Develop Narratage itself](./docs/guide/develop.md)

## Repository map

```text
packages/   Core, compiler, Runtime, video packages and Provider adapters
services/   Local external programs such as WhisperX and OpenCV
examples/   Checkable sources and complete Runtime examples
docs/       User guides, architecture and implementation records
spec/       Normative protocol and video-package contracts
tools/      Repository checks and focused development tools
```

## Development

The commands below are for changing Narratage itself, not for making a video:

```bash
pnpm check
pnpm test
pnpm docs:build
```

Current implementation facts and remaining work live in
[Implementation Status](./docs/implementation-status.md) and the [Roadmap](./docs/roadmap.md).
