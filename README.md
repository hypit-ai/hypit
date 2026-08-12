<p align="center">
  <img alt="Narratage" src="docs/public/narratage-logo.svg" width="420">
</p>

<p align="center"><em>“First, there was narration. Then, there were montages.”</em></p>

<p align="center">
  <a href="https://narratage.hypit.ai/">Demos</a>&nbsp;&nbsp;<a href="https://narratage.hypit.ai/quickstart">Quickstart</a>&nbsp;&nbsp;<a href="https://narratage.hypit.ai/guide/develop">Develop</a>&nbsp;&nbsp;<a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/narratage/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hypit-ai/narratage/ci.yml?branch=main&label=CI"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0%20with%20conditions-blue.svg"></a>
  <a href="https://github.com/hypit-ai/narratage/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/narratage?style=flat"></a>
</p>

Narratage is a semantic, graph-native system for making AI video. You write the story, choose the
models and visual components, and state which outputs you want. Narratage turns that intent into a
finite execution plan, runs only the work the result depends on, and keeps every accepted output
available for later Runs.

SVML is the authoring language. Narratage is the compiler, runtime and package ecosystem around it.

## Where the name comes from

A 1933 *New York Times* review of *The Power and the Glory* coined **narratage** for a then-new
technique: narration plus montage, a narrator's voice carrying the story while the screen assembles
scenes to match.

That is what this system does. The author writes a narrated Script with semantic anchors, and the
compiler assembles generated video, captions, B-roll, text and audio into a finished film.

## What it feels like

The Script stays readable prose. Segments organize the story, Role Cues say who speaks, Dual Text
separates what viewers read from what the speaker says, and Selections and Moments name semantic
ranges and points without introducing timecodes.

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

Every marker in that Script:

| Form | Meaning |
|---|---|
| `<opening>...</opening>` / `<pause/>` | a spoken Segment, and an empty one |
| `<MARA>` | a Role Cue, in force until the next cue or the end of the Segment |
| `<2:13 A.M. \| two thirteen in the morning>` | left is displayed, right is spoken |
| `< \| only>` | spoken, never captioned |
| `@mystery ... @/mystery` | a Selection covering exactly the words between the markers |
| `~@proof ... @/proof~` | the same, but reaching out to take in the neighbouring word on each side |
| repeated `@beat ... @/beat` | one Selection that appears in more than one place |
| `@flash!` / `~@cut!` | a Moment on the next word's start / the previous word's end |
| `\@midnight` | the literal text `@midnight` |
| `<!-- ... -->` | a comment; it never reaches any output text |

A marker name carries no behaviour of its own: `@silence` does not mute audio, and an Audio,
Caption or Track component must explicitly consume that Selection. The full vocabulary is in
[Script](https://narratage.hypit.ai/quickstart/script); the complete checkable source is
[`talking-film-graph-check`](./examples/talking-film-graph-check/main.svml).

## Use the Narratage skill

If you use a coding agent, send it this:

```text
Install and use the narratage skill from this repository. Set up my environment, ask for only the
API keys required by my Runtime Profile, and guide me through authoring and building my first SVML
video.
```

## Try it without API keys

Node.js 22+ and pnpm 10.33.x:

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
subgraph and every external capability a real Build would need, without starting any of it.

## Why a graph

AI generation is slow, costly and non-deterministic, and each output tends to become the next
step's input. Narratage keeps the resulting choices visible as two peer graphs: the Author Graph
expresses the work, the Run Graph selects Targets and Candidates for one Build. Core only resolves,
verifies and advances the resulting state machine, so video concepts stay in independently
installable packages — Core hard-codes no model, Track or Provider.

## Where to go next

- [Demos](https://narratage.hypit.ai/) — see it running: hover a marked range in a Script and the
  frame it produces appears beside it.
- [Quickstart](https://narratage.hypit.ai/quickstart) — the files you control, the commands, and
  your first real Build.
- [Develop](https://narratage.hypit.ai/guide/develop) — package architecture, adding an author
  package or a Provider.

## License

Narratage is released under the [Narratage Open Source License](./LICENSE), based on Apache 2.0 with
additional conditions. You may run it on your own infrastructure, including for your organization's
commercial work, and you may fork, modify and publish the source under the same terms. Operating
Narratage as a multi-tenant or hosted service, and supplying it to third parties for commercial
gain, each require a commercial license. Content you produce with Narratage belongs to you.

For commercial licensing, email [official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry).
