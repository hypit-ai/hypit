<p align="center">
  <img alt="Narratage" src="docs/public/narratage-logo.svg" width="420">
</p>

<p align="center"><em>“First, there was narration. Then, there were montages.”</em></p>

<p align="center">
  <a href="https://narratage.hypit.ai/">Demos</a>&nbsp;&nbsp;<a href="https://narratage.hypit.ai/quickstart">Quickstart</a>&nbsp;&nbsp;<a href="https://narratage.hypit.ai/guide/develop">Develop</a>&nbsp;&nbsp;<a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/narratage/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/narratage?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars"></a>
  <a href="https://github.com/hypit-ai/narratage/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/hypit-ai/narratage?style=flat-square&color=6E40C9&logo=github&logoColor=white&label=Forks"></a>
  <a href="https://github.com/hypit-ai/narratage/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/hypit-ai/narratage?style=flat-square&color=2EA043&logo=github&logoColor=white"></a>
  <a href="./package.json"><img alt="Node 22+" src="https://img.shields.io/badge/node-22+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-yellow?style=flat-square"></a>
  <a href="https://github.com/hypit-ai/narratage/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hypit-ai/narratage/ci.yml?branch=main&style=flat-square&label=CI"></a>
</p>

<p align="center">
  <a href="https://narratage.hypit.ai/"><img alt="Website" src="https://img.shields.io/badge/Website-narratage.hypit.ai-000000?style=flat-square&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="X" src="https://img.shields.io/badge/Follow-%40hypitai-000000?style=flat-square&logo=x&logoColor=white"></a>
  <a href="https://t.me/narratage"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-Join%20Group-26A5E4?style=flat-square&logo=telegram&logoColor=white"></a>
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

Node.js and pnpm are all either command needs. A real Build additionally needs `ffmpeg` and
`ffprobe` on your `PATH` — `brew install ffmpeg` on macOS, `apt install ffmpeg` on Debian and
Ubuntu — and, depending on the Runtime Profile you select, Python with `uv` or API credentials.
`narratage doctor` reports what is missing before a Build runs; see
[Local tools used by real Builds](https://narratage.hypit.ai/quickstart#local-tools-used-by-real-builds).

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

## Third-party software

Narratage stands on work it does not ship.

- [FFmpeg](https://ffmpeg.org/) — media inspection, normalization and muxing. Invoked as a separate
  program you install yourself, under its own license.
- [HyperFrames](https://www.npmjs.com/package/hyperframes) — renders Compositions in a headless
  Chromium.
- [WhisperX](https://github.com/m-bain/whisperX) — the word-level speech alignment behind caption
  timing.
- [Fontsource](https://fontsource.org/) — the open font catalog, delivered as pinned packages that
  each carry their own SIL OFL 1.1 or Apache 2.0 license and their own font bytes. Narratage
  neither vendors font files nor reads system fonts.

## License

Narratage is released under the [Narratage Open Source License](./LICENSE), based on Apache 2.0 with
additional conditions. You may run it on your own infrastructure, including for your organization's
commercial work, and you may fork, modify and publish the source under the same terms. Operating
Narratage as a multi-tenant or hosted service, and supplying it to third parties for commercial
gain, each require a commercial license. Content you produce with Narratage belongs to you.

For commercial licensing, email [official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry).
