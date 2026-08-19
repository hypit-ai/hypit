<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/hypit-logo-light.png">
    <img alt="Hypit" src="./docs/public/hypit-logo-dark.png" width="400" height="78">
  </picture>
</p>

<p align="center">
  <!-- The empty comment stops GFM autolinking "#1" as a reference to issue 1. -->
  <strong>World's #<!-- -->1 video programming language and system for AI agents.</strong>
  <br>
  <em>Humans edit video. Agents compile it.</em>
</p>

<p align="center">
  <a href="https://hypit.ai/"><strong>Demos</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://hypit.ai/quickstart"><strong>Quickstart</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://hypit.ai/guide/develop"><strong>Develop</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/hypit/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/hypit?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars"></a>
  <a href="./package.json"><img alt="Node 22+" src="https://img.shields.io/badge/Node.js-22+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./package.json"><img alt="pnpm 10.33" src="https://img.shields.io/badge/pnpm-10.33-F69220?style=flat-square&logo=pnpm&logoColor=white"></a>
  <a href="./package.json"><img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-E3B341?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://hypit.ai/"><img alt="Visit our website" src="https://img.shields.io/badge/Visit%20our%20website-000000?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Join our Discord" src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white"></a>
  <a href="https://t.me/hypit"><img alt="Join our Telegram" src="https://img.shields.io/badge/Join%20our%20Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="Follow @hypitai on X" src="https://img.shields.io/badge/Follow%20%40hypitai-000000?style=for-the-badge&logo=x&logoColor=white"></a>
</p>

<p align="center">
  ⭐ <em>Help more people find Hypit and grow the community. Star this repo!</em>
</p>

## Why Hypit

Every video editor — Premiere, CapCut, DaVinci, Final Cut — was built for human hands on a timeline.

**Hypit is a language and system designed for AI agents.**

- **No timeline** — videos are written, not dragged. B-roll, effects and every track live in source.
- **Agent-native** — plain text in, finished video out. Agents read and write it like code.
- **Pinned to words** — regeneration shifts timing, yet B-roll and effects follow their words.
- **Batch-ready** — it's all source files. Produce video at the scale of code, not at the speed of editing.

> ### [See demos — SVML source and rendered video side by side →](https://hypit.ai/)

## How it works

Hypit compiles SVML source files into finished videos.

1. **Write** — SVML describes who speaks, what they say, and where B-roll and effects go. No timecodes.
2. **Generate** — Seedance, MiniMax H3 and GPT Image 2 produce every shot from prompts and references.
3. **Align** — WhisperX pins every spoken word to an exact time. B-roll and effects follow words, not seconds.
4. **Render** — HyperFrames composites all tracks frame by frame into MP4.

Change the script, keep the results you approve, and regenerate only what you choose to replace.

## The language

SVML — Semantic Video Markup Language — is the authoring language. Hypit is the compiler, runtime and package ecosystem around it.

A complete `.svml` file:

```xml
<?svml using="@hypit/markup@1"?>
<svml>
  <import from="@hypit/script@1"/>
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

Components outside the Script (video generators, speech models, caption renderers, track compositors) consume what the Script declares. The Script itself carries no rendering logic. Full syntax: [Script spec](https://hypit.ai/quickstart/script).

## Quickstart

### Clone the repository

```bash
git clone https://github.com/hypit-ai/hypit.git
cd hypit
```

### With a coding agent

`/hypit` is available from that working directory. Send your agent:

```text
/hypit Set up my environment, ask for only the API keys required by my Runtime Profile, and guide me through authoring and building my first SVML video.
```

### From the terminal

Node.js 22+ and pnpm 10.33.x:

```bash
corepack enable
pnpm install --frozen-lockfile
npm link
```

Then, from a video project:

```bash
cd my-video
hypit runtime use hypit.runtime.json
hypit plan build.svrun
hypit build build.svrun
hypit status <build-id> --watch
hypit get <build-id> --name final.video --to output/final.mp4
```

`build` prints a fresh Build ID and returns after durable submission. `status --watch` can attach to
that Build from any later terminal. Use `check` while editing; package selection follows Source
imports and the selected Runtime Profile.

A real Build additionally needs `ffmpeg` and `ffprobe` on your `PATH`, and depending on the Runtime Profile, Python with `uv` or API credentials. Run `hypit doctor` to see what's missing; see [Quickstart](https://hypit.ai/quickstart) for the complete setup and a provider-free first plan.

### Project files

Hypit separates authorship from execution:

| File | What it decides |
|---|---|
| `.svml` | What video to make, including the script, generated media and tracks |
| `.svs` | Reusable creative choices such as prompts, styles and layout |
| `.svrun` | What to build this time, including targets and prior results to reuse |
| Runtime profile | How and where to run, including providers, credentials and storage |

A project can have any number of these files, and the same `.svml` can be built by many `.svrun` files.

## Where the name comes from

<p align="center"><em>narration + montage = <strong>hypit</strong></em></p>

> *“The new treatment, which the producer calls ‘hypit,’ is eminently well suited …”*
>
> — Mordaunt Hall, *The New York Times*, 1933

In the review of Spencer Tracy's *The Power and the Glory*, producer Jesse L. Lasky's term **hypit** described a technique where a narrator's voice carries the story while the screen assembles scenes to match.

Ninety years later, Hypit gives the same idea a new form: a language and system that compiles the montage around the narration.

## Architecture

AI generation is slow, costly and non-deterministic. Hypit compiles requested work into a durable plan.

The Core is small and domain-neutral: it knows nothing about video. Installing a package adds capability without requiring a Core release.

| Layer | What it owns | Examples |
|---|---|---|
| **Hypit Core** | Plan compilation and the Build state machine | `core`, `protocol` |
| **Compiler** | Source parsing, imports and graph elaboration | `host`, `markup`, `svs`, `elaborator` |
| **Foundations** | Reusable media, time, layout, text and transport building blocks | `media-pipeline`, `temporal`, `spatial` |
| **Video authoring** | Script, generation, speech, tracks, film and rendering | `script`, `seedance`, `caption`, `film` |
| **Providers** | Adapters for external models, APIs and Managed Programs | `provider-kie`, `provider-whisperx-local` |
| **Runtime** | Scheduling, storage, credentials and execution | `runtime`, `store-sqlite`, `runtime-local` |
| **Applications** | User-facing ways to author and operate Hypit | `cli`, `svml-playground` |

## Where to go next

- [Demos](https://hypit.ai/) — see SVML source and its rendered result side by side.
- [Quickstart](https://hypit.ai/quickstart) — write, preview, plan and build your first video.
- [Develop](https://hypit.ai/guide/develop) — understand the package architecture and add an Author package or Provider.

## Third-party software

Hypit integrates with independently licensed software:

- [FFmpeg](https://ffmpeg.org/) — inspects, normalizes, transforms and muxes media as a separately licensed executable.
- [HyperFrames](https://www.npmjs.com/package/hyperframes) — turns Compositions into frame-accurate video in Chromium.
- [WhisperX](https://github.com/m-bain/whisperX) — aligns spoken words to time for semantic placement.
- [Fontsource](https://fontsource.org/) — supplies versioned, openly licensed font packages, each with its own font files and license.

## License

Hypit is released under the [Hypit Open Source License](./LICENSE), a modified Apache 2.0 license. You may self-host it, use it for your organization's work — including commercial work and work for clients — and operate a single-tenant deployment for one organization. Multi-tenant or hosted offerings for third parties, and commercial redistribution, require a commercial license. You may fork, modify and publish the source under the same license when it is not supplied for commercial gain. Brand and copyright notices presented by Hypit must remain intact.

The content you produce with Hypit belongs to you. Outputs created through third-party models or services may also be subject to those providers' terms.

For commercial licensing, email [official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DHypit%20Commercial%20License%20Inquiry).
