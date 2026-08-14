<p align="center">
  <img alt="Narratage" src="docs/public/narratage-logo.svg" width="420">
</p>

<p align="center">
  <strong>A language and system for AI agents to create video.</strong>
  <br>
  <em>Humans edit video. Agents compile it.</em>
</p>

<p align="center">
  <a href="https://narratage.hypit.ai/"><strong>Demos</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://narratage.hypit.ai/quickstart"><strong>Quickstart</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://narratage.hypit.ai/guide/develop"><strong>Develop</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/narratage/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/narratage?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars"></a>
  <a href="./package.json"><img alt="Node 22+" src="https://img.shields.io/badge/Node.js-22+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./package.json"><img alt="pnpm 10.33" src="https://img.shields.io/badge/pnpm-10.33-F69220?style=flat-square&logo=pnpm&logoColor=white"></a>
  <a href="./package.json"><img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-E3B341?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://narratage.hypit.ai/"><img alt="Website" src="https://img.shields.io/badge/Website-narratage.hypit.ai-000000?style=flat-square&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="X" src="https://img.shields.io/badge/Follow-%40hypitai-000000?style=flat-square&logo=x&logoColor=white"></a>
  <a href="https://t.me/narratage"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-Join%20Group-26A5E4?style=flat-square&logo=telegram&logoColor=white"></a>
</p>

## Why Narratage

Every video editor — Premiere, CapCut, DaVinci, Final Cut — was built for human hands on a timeline. Narratage is a language and system designed for AI agents.

- **No timeline** — videos are written, not dragged. B-roll, effects and every track live in source.
- **Agent-native** — plain text in, finished video out. Agents read and write it like code.
- **Pinned to words** — regenerate a segment, the timing shifts — B-roll and effects stay pinned to their words.
- **Batch-ready** — it's all source files. Produce video at the scale of code, not at the speed of editing.

## How it works

Narratage compiles SVML source files into finished videos.

1. **Write** — SVML describes who speaks, what they say, and where B-roll and effects go. No timecodes.
2. **Generate** — Seedance, MiniMax H3 and GPT Image 2 produce every shot from prompts and references.
3. **Align** — WhisperX pins every spoken word to an exact time. B-roll and effects follow words, not seconds.
4. **Render** — HyperFrames composites all tracks frame by frame into MP4.

Change the script, keep the results you approve, and regenerate only what you choose to replace.

## The language

SVML — Semantic Video Markup Language — is the authoring language. Narratage is the compiler, runtime and package ecosystem around it.

A complete `.svml` file:

```xml
<?svml using="@narratage/markup@1"?>
<svml>
  <import from="@narratage/script@1"/>
  <import as="studio" source="./studio.svs"/>

  <script id="story">
    <intro>
      <HOST>I tested @product this espresso machine @/product for thirty days.
    </intro>

    <verdict>
      <HOST>At <$299 | two ninety-nine>, best home espresso I've ever had.
            If you care about your morning cup — this is the one.
    </verdict>
  </script>
</svml>
```

Four constructs. That's the whole authoring surface:

| Construct | Example | What it does |
|---|---|---|
| **Segment** | `<intro>...</intro>` | A named narrative block — a paragraph that knows it's a paragraph |
| **Speaker** | `<HOST>` | Marks who speaks; in force until the next cue or end of the Segment |
| **Split** | `<$299 \| two ninety-nine>` | What viewers read on screen can differ from what they hear |
| **Hook** | `@product...@/product` | Pin a visual — B-roll, graphic, effect — to specific words |

Components outside the Script (video generators, speech models, caption renderers, track compositors) consume what the Script declares. The Script itself carries no rendering logic. Full syntax: [Script spec](https://narratage.hypit.ai/quickstart/script).

## Quickstart

### Clone the repository

```bash
git clone https://github.com/hypit-ai/narratage.git
cd narratage
```

### With a coding agent

`/narratage` is available from that working directory. Send your agent:

```text
/narratage Set up my environment, ask for only the API keys required by my Runtime Profile, and guide me through authoring and building my first SVML video.
```

### From the terminal

Node.js 22+ and pnpm 10.33.x:

```bash
corepack enable
pnpm install --frozen-lockfile

node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock
```

`check` verifies the source and prints its typed outputs. `plan` shows the exact execution subgraph and every external capability a real Build would need — without starting any of it.

A real Build additionally needs `ffmpeg` and `ffprobe` on your `PATH`, and depending on the Runtime Profile, Python with `uv` or API credentials. Run `narratage doctor` to see what's missing; see [Quickstart](https://narratage.hypit.ai/quickstart) for the full walkthrough.

### Project files

Narratage separates authorship from execution:

| File | What it decides |
|---|---|
| `.svml` | What video to make, including the script, generated media and tracks |
| `.svs` | Reusable creative choices such as prompts, styles and layout |
| `.svrun` | What to build this time, including targets and prior results to reuse |
| Runtime profile | How and where to run, including providers, storage and concurrency |

A project can have any number of these files, and the same `.svml` can be built by many `.svrun` files.

## Where the name comes from

<p align="center"><em>narration + montage = <strong>narratage</strong></em></p>

<p align="center">
  <em>“The new treatment, which the producer calls <strong>‘narratage,’</strong><br>
  is eminently well suited to this particular dramatic vehicle.”</em>
  <br>
  — Mordaunt Hall, <em>The New York Times</em>, 1933
</p>

In the review of Spencer Tracy's *The Power and the Glory*, producer Jesse L. Lasky's term **narratage** described a technique where a narrator's voice carries the story while the screen assembles scenes to match.

Ninety years later, Narratage gives the same idea a new form: a language and system that compiles the montage around the narration.

## Architecture

AI generation is slow, costly and non-deterministic. Narratage compiles requested work into a durable plan.

The Core is small and domain-neutral: it knows nothing about video. Installing a package adds capability without requiring a Core release.

| Layer | What it owns | Examples |
|---|---|---|
| **Narratage Core** | Plan compilation and the Build state machine | `core`, `protocol` |
| **Compiler** | Source parsing, imports and graph elaboration | `host`, `markup`, `svs`, `elaborator` |
| **Infrastructure** | Media processing, spatial layout, fonts and text | `media-pipeline`, `spatial`, `fonts-open` |
| **Video authoring** | Script, generation, speech, tracks, film and rendering | `script`, `seedance`, `caption`, `film` |
| **Providers** | Adapters for external models, programs and services | `provider-kie`, `provider-whisperx-local` |
| **Runtime** | Scheduling, storage, credentials and execution | `runtime`, `store-sqlite`, `local` |
| **Applications** | User-facing ways to author and operate Narratage | `cli`, `svml-playground` |

## Where to go next

- [Demos](https://narratage.hypit.ai/) — see SVML source and its rendered result side by side.
- [Quickstart](https://narratage.hypit.ai/quickstart) — write, preview, plan and build your first video.
- [Develop](https://narratage.hypit.ai/guide/develop) — understand the package architecture and add an Author package or Provider.

## Third-party software

Narratage integrates with independently licensed software:

- [FFmpeg](https://ffmpeg.org/) — inspects, normalizes, transforms and muxes media as a separately licensed executable.
- [HyperFrames](https://www.npmjs.com/package/hyperframes) — turns Compositions into frame-accurate video in Chromium.
- [WhisperX](https://github.com/m-bain/whisperX) — aligns spoken words to time for semantic placement.
- [Fontsource](https://fontsource.org/) — supplies versioned, openly licensed font packages, each with its own font files and license.

## License

Narratage is released under the [Narratage Open Source License](./LICENSE), a modified Apache 2.0 license. You may self-host it, use it for your organization's work — including commercial work and work for clients — and operate a single-tenant deployment for one organization. Multi-tenant or hosted offerings for third parties, and commercial redistribution, require a commercial license. You may fork, modify and publish the source under the same license when it is not supplied for commercial gain. Brand and copyright notices presented by Narratage must remain intact.

The content you produce with Narratage belongs to you. Outputs created through third-party models or services may also be subject to those providers' terms.

For commercial licensing, email [official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry).
