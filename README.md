<p align="center">
  <img alt="Narratage" src="docs/public/narratage-logo.svg" width="420">
</p>

<p align="center">
  <strong>The world's first programming language for agents to create video.</strong>
  <br>
  <em>Built on a 1933 filmmaking technique that was ninety years ahead of its time.</em>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/narratage/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/narratage?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars"></a>
  <a href="./packages"><img alt="Packages" src="https://img.shields.io/badge/Packages-103-4169E1?style=flat-square"></a>
  <a href="./package.json"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-100K%2B%20lines-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="./package.json"><img alt="Node 22+" src="https://img.shields.io/badge/Node.js-22+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-E3B341?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://narratage.hypit.ai/"><img alt="Website" src="https://img.shields.io/badge/Website-narratage.hypit.ai-000000?style=flat-square&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="X" src="https://img.shields.io/badge/Follow-%40hypitai-000000?style=flat-square&logo=x&logoColor=white"></a>
  <a href="https://t.me/narratage"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-Join%20Group-26A5E4?style=flat-square&logo=telegram&logoColor=white"></a>
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

## Why Narratage

In 1933, producer Jesse L. Lasky coined **narratage** for Spencer Tracy's *The Power and the Glory*: narration drives montage — the narrator speaks, the screen assembles scenes to match. Hollywood moved on and the word disappeared for ninety years. It turns out to be exactly what AI agents need: write the narration, the system compiles the montage. No timeline, no mouse — source files in, finished video out.

> **[See demos — SVML source and rendered video side by side →](https://narratage.hypit.ai/)**

## Narratage vs timeline editors

Every video editor — Premiere, CapCut, DaVinci, Final Cut — was designed for human hands on a timeline.

|  | Timeline editors | Narratage |
|---|---|---|
| **Built for** | Human editors with a mouse | AI agents reading and writing text |
| **Video structure** | Clips on a timeline | Source files compiled into video |
| **Timing** | Manual frame placement | Visuals pinned to spoken words |
| **Regeneration** | Redo the sequence | Keep what works, regenerate what changed |
| **Batch production** | One project at a time | Produce at the scale of code |
| **Version control** | Binary project files | Plain text, fully diffable |

Narratage does not replace timeline editors for interactive, hands-on editing. It replaces the need for one when the editor is an AI agent.

## How it works

Narratage compiles SVML source files into finished videos.

1. **Write** — SVML describes who speaks, what they say, and where B-roll and effects go. No timecodes.
2. **Generate** — Seedance, MiniMax H3, GPT Image, Seedream and others produce every shot from prompts and references.
3. **Align** — WhisperX pins every spoken word to an exact time. B-roll and effects follow words, not seconds.
4. **Render** — HyperFrames composites all tracks frame by frame into MP4.

Change the script, keep the results you approve, and regenerate only what you choose to replace.

## The language

SVML — Semantic Video Markup Language — is the authoring surface. A complete `.svml` file:

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

Four constructs — the whole authoring surface:

| Construct | Example | What it does |
|---|---|---|
| **Segment** | `<intro>...</intro>` | A named narrative block |
| **Speaker** | `<HOST>` | Who speaks — in force until the next cue |
| **Split** | `<$299 \| two ninety-nine>` | Screen text differs from spoken audio |
| **Hook** | `@product...@/product` | Pins a visual — B-roll, graphic, effect — to specific words |

Components outside the Script (video generators, speech models, caption renderers, track compositors) consume what the Script declares. The Script itself carries no rendering logic. Full syntax: [Script spec](https://narratage.hypit.ai/quickstart/script).

## What's inside

103 packages. 100,000+ lines of TypeScript. A real compiler and runtime — not wrappers around someone else's API.

| Layer | What it owns | Examples |
|---|---|---|
| **Core** | Plan compilation and the Build state machine | `core`, `protocol` |
| **Compiler** | Source parsing, imports and graph elaboration | `host`, `markup`, `svs`, `elaborator` |
| **Infrastructure** | Media processing, spatial layout, fonts and text | `media-pipeline`, `spatial`, `fonts-open` |
| **Video authoring** | Script, generation, speech, tracks, film and rendering | `script`, `seedance`, `caption`, `film` |
| **Providers** | Adapters for external models, programs and services | `provider-kie`, `provider-whisperx-local` |
| **Runtime** | Scheduling, storage, credentials and execution | `runtime`, `store-sqlite`, `local` |
| **Applications** | User-facing entry points | `cli`, `svml-playground` |

AI generation is slow, costly and non-deterministic. The Core compiles requested work into a durable plan — nothing runs until you say so. Installing a package adds capability without requiring a Core release.

## Quickstart

### With a coding agent

Clone the repo and send your agent:

```bash
git clone https://github.com/hypit-ai/narratage.git
cd narratage
```

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

Narratage gives files distinct roles without reserving their names:

| Role | Usual form | How it is selected |
|---|---|---|
| **Author Source** | `.svml` | Passed to `check`, or referenced by a Run Source |
| **Recipe Source** | `.svs` | Imported by another Source |
| **Run Source** | `.svrun` | Passed to `plan` or `build` |
| **Runtime Profile** | JSON | Passed explicitly with `--runtime` |
| **Package inventories** | JSON lock files | Referenced by a Runtime Profile or selected explicitly by the CLI |

Names and suffixes are conventions, not parser dispatch. Every Source selects its own Frontend with a `<?svml using="..."?>` header; Runtime Profiles and package inventories are selected by explicit paths. A project may contain any number of each role, and one Author Source may be referenced by many Run Sources.

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

---

<p align="center">
  If Narratage is useful to you, a ⭐ helps others discover it.
</p>
