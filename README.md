<p align="center">
  <img alt="Narratage" src="docs/public/narratage-logo.svg" width="420">
</p>

<p align="center"><em>“First, there was narration. Then, there were montages.”</em></p>

<p align="center">
  <a href="https://narratage.hypit.ai/quickstart">Quickstart</a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://narratage.hypit.ai/guide/develop">Develop</a>
  &nbsp;&nbsp;&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
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

```xml
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
are documented in [Script](https://narratage.hypit.ai/quickstart/script). Slot binding is not yet
exposed by the author-facing `<script>` Surface.

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
  --package-lock examples/talking-film-graph-check/svml.packages.lock

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock
```

`check` verifies the Author Source and prints its typed outputs. `plan` shows the exact demanded
subgraph and every external capability a real Build would need. Planning never starts external work.

See the [Quickstart](https://narratage.hypit.ai/quickstart) if Corepack is unavailable or you want to run local media,
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

# Setup once, then repeat only after imports or Runtime package choices change.
/path/to/narratage/narratage packages sync build.svrun \
  --runtime svml.runtime.json

# See the exact work selected by this Run.
/path/to/narratage/narratage plan build.svrun \
  --runtime svml.runtime.json

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
`inspect` to see what is happening. `check` is useful while editing source; `doctor` diagnoses the
whole deployment when setting up or troubleshooting it. Neither is a ritual before every Build.

Read [Run Source & Builds](https://narratage.hypit.ai/quickstart/run) before the first paid Build. It covers Runtime
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

For the small normative laws, read the [Core Kernel specification](./spec/core-kernel.md).

## Development

The commands below are for changing Narratage itself, not for making a video:

```bash
pnpm check
pnpm test
pnpm docs:build
```

## License

Narratage is released under the [Narratage Open Source License](./LICENSE), based on Apache 2.0 with
additional conditions. You may run it on your own infrastructure, including for your organization's
commercial work, and you may fork, modify and publish the source under the same terms. Operating
Narratage as a multi-tenant or hosted service, and supplying it to third parties for commercial
gain, each require a commercial license. Content you produce with Narratage belongs to you.

For commercial licensing, email [official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry).
