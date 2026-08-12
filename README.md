<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/narratage-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/public/narratage-logo-vector.svg">
    <img alt="Narratage" src="docs/public/narratage-logo-vector.svg" width="420">
  </picture>
</p>

<p align="center"><strong>Write the story. Compile the video.</strong></p>

<p align="center">
  <a href="https://narratage.hypit.ai/">Documentation</a> ·
  <a href="https://narratage.hypit.ai/zh/">中文文档</a> ·
  <a href="https://narratage.hypit.ai/quickstart">Quickstart</a> ·
  <a href="./examples/README.md">Examples</a>
</p>

Narratage is a semantic, graph-native system for making AI video. You write the story, choose the
models and visual components, and state which outputs you want. Narratage turns that intent into a
finite execution plan, runs only the work the result depends on, and keeps every accepted output
available for later Runs.

SVML is the authoring language. Narratage is the compiler, runtime and package ecosystem around it.

Narratage currently runs from a source checkout. The npm packages and CLI have not been published
yet.

## What it feels like

The Script remains readable prose. Segments organize the story; Role Cues say who speaks; Dual Text
separates what viewers read from what the speaker says; Selections and Moments name semantic ranges
and points without introducing timecodes.

```svml
<script id="story">
  @whole

  <opening>
    <MARA> @mystery @beat At <2:13 A.M. | two thirteen in the morning>,
           every billboard in the city began telling the same story. @/beat @/mystery
  </opening>

  <reveal>
    <!-- The screens wake before the city does. -->
    @claim
    <NOAH> Whose story?
    <MARA> Mine. They spent ten years ~@proof cutting me out of @flash!
           every photograph. @/claim So I put myself back into all of them @/proof~.
    <NOAH> @beat You rewrote the whole city? @/beat
    <MARA> I < | only> changed one thing ~@cut!: the ending.
           I signed it \@midnight.
  </reveal>

  @silence
  <pause/>
  @/silence

  <tagline>
    By sunrise, the city remembered the woman history had erased.
  </tagline>

  @/whole~
</script>

<seedance:TextVideo id="take"
  model="mini"
  prompt={story.segment.opening.dialogue}
  duration="5"
  generate-audio="true"/>

<whisperx:Alignment id="timing"
  narrative={story}
  audio={speech.audio}/>

<media-track:Item
  video={motion.video}
  during={story.selection.proof}
  frame={card-frame}/>
```

The Script excerpt shows the complete marker vocabulary:

| Form | Meaning |
|---|---|
| `<opening>...</opening>` / `<pause/>` | spoken and empty Segments |
| `<MARA>` | a Role Cue; it continues until the next cue or Segment end |
| `<2:13 A.M. \| two thirteen in the morning>` | display text on the left, spoken text on the right |
| `< \| only>` | spoken filler deliberately absent from captions |
| `@mystery ... @/mystery` | Selection whose boundaries absorb inward |
| `~@proof ... @/proof~` | Selection whose boundaries absorb outward |
| repeated `@beat ... @/beat` | one non-contiguous Selection with multiple occurrences |
| `@flash!` / `~@cut!` | Moments attached to the next word start / previous word end |
| `\@midnight` | a literal `@midnight`, not a marker |
| `<!-- ... -->` | a source comment; it enters no text projection |

`@whole` crosses Segment boundaries; `@claim` and `proof` demonstrate that Selections may cross
instead of nesting. `tagline` shows that a Segment may be roleless. Repeating the same Selection id
creates multiple non-contiguous occurrences.
Marker names carry no built-in behavior: `@silence` does not mute audio; an Audio, Caption or Track
component must explicitly consume that Selection. The complete escape set and Slot parser contract
are documented in [Script](./docs/quickstart/script.md); Slot binding is not yet exposed by the
author-facing `<script>` Surface, so the README does not pretend it is usable source syntax today.

The outer component lines are deliberately an excerpt: they show how generated media, alignment and
Tracks consume Script projections. See the complete, checkable
[`talking-film-graph-check`](./examples/talking-film-graph-check/main.svml) source for imports,
layout, captions, Film and rendering. Namespaced components come from packages; Core does not
hard-code Seedance, WhisperX, Caption or Film.

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
