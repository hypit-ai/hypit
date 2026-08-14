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
  <a href="https://github.com/hypit-ai/narratage/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hypit-ai/narratage/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI"></a>
  <a href="https://github.com/hypit-ai/narratage/actions/workflows/deploy-pages.yml"><img alt="Docs" src="https://img.shields.io/github/actions/workflow/status/hypit-ai/narratage/deploy-pages.yml?branch=main&style=flat-square&logo=githubpages&logoColor=white&label=Docs"></a>
  <a href="./package.json"><img alt="Node 22+" src="https://img.shields.io/badge/Node.js-22+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./package.json"><img alt="pnpm 10.33" src="https://img.shields.io/badge/pnpm-10.33-F69220?style=flat-square&logo=pnpm&logoColor=white"></a>
  <a href="./package.json"><img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-E3B341?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/narratage/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/narratage?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars"></a>
  <a href="https://github.com/hypit-ai/narratage/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/hypit-ai/narratage?style=flat-square&color=6E40C9&logo=github&logoColor=white&label=Forks"></a>
  <a href="https://github.com/hypit-ai/narratage/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/hypit-ai/narratage?style=flat-square&color=2EA043&logo=github&logoColor=white"></a>
  <a href="https://github.com/hypit-ai/narratage/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/hypit-ai/narratage?style=flat-square&color=D29922&logo=github&logoColor=white"></a>
  <a href="https://github.com/hypit-ai/narratage/pulls"><img alt="Open pull requests" src="https://img.shields.io/github/issues-pr/hypit-ai/narratage?style=flat-square&color=1F6FEB&logo=github&logoColor=white"></a>
  <a href="https://github.com/hypit-ai/narratage/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/hypit-ai/narratage?style=flat-square&color=8B949E&logo=git&logoColor=white"></a>
  <a href="https://github.com/hypit-ai/narratage/commits/main"><img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/hypit-ai/narratage?style=flat-square&color=BF4B8A&logo=git&logoColor=white"></a>
  <a href="https://github.com/hypit-ai/narratage"><img alt="Repository size" src="https://img.shields.io/github/repo-size/hypit-ai/narratage?style=flat-square&color=0969DA&logo=github&logoColor=white"></a>
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

SVML is the authoring language. Narratage is the compiler, runtime and package ecosystem around it.

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

### With a coding agent

Send your agent this prompt:

```text
Install and use the narratage skill from this repository. Set up my environment, ask for only the
API keys required by my Runtime Profile, and guide me through authoring and building my first SVML
video.
```

### From the terminal

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

`check` verifies the source and prints its typed outputs. `plan` shows the exact execution subgraph and every external capability a real Build would need — without starting any of it.

A real Build additionally needs `ffmpeg` and `ffprobe` on your `PATH`, and depending on the Runtime Profile, Python with `uv` or API credentials. Run `narratage doctor` to see what's missing; see [Quickstart](https://narratage.hypit.ai/quickstart) for the full walkthrough.

## Where the name comes from

A 1933 *New York Times* review of *The Power and the Glory* coined **narratage**: narration plus montage — a narrator's voice carries the story while the screen assembles scenes to match.

That is what this system does. The author writes a narrated Script, and the compiler assembles generated video, captions, B-roll, text and audio into a finished film.

## Architecture

AI generation is slow, costly and non-deterministic, and each output tends to become the next step's input. Narratage keeps the resulting choices visible as two peer graphs: the **Author Graph** expresses the work, the **Run Graph** selects targets for one Build. Core resolves, verifies and advances the state machine — video concepts stay in independently installable packages, so Core hard-codes no model, Track or Provider.

Three files each own one concern: `.svml` says *what video to make* (script + styles + tracks), `.svrun` says *what to build this time* (which targets, reusing which prior results), and the runtime profile says *where to run* (API keys, concurrency, permissions).

## Where to go next

- [Demos](https://narratage.hypit.ai/) — hover a marked range in a Script, see the frame it produces.
- [Quickstart](https://narratage.hypit.ai/quickstart) — the files you control, the commands, and your first real Build.
- [Develop](https://narratage.hypit.ai/guide/develop) — package architecture, adding an author package or a Provider.

## Third-party software

Narratage stands on work it does not ship.

- [FFmpeg](https://ffmpeg.org/) — media inspection, normalization and muxing. Invoked as a separate program you install yourself, under its own license.
- [HyperFrames](https://www.npmjs.com/package/hyperframes) — renders Compositions in a headless Chromium.
- [WhisperX](https://github.com/m-bain/whisperX) — the word-level speech alignment behind caption timing.
- [Fontsource](https://fontsource.org/) — the open font catalog, delivered as pinned packages that each carry their own SIL OFL 1.1 or Apache 2.0 license and their own font bytes. Narratage neither vendors font files nor reads system fonts.

## License

Narratage is released under the [Narratage Open Source License](./LICENSE), based on Apache 2.0 with additional conditions. You may run it on your own infrastructure, including for your organization's commercial work, and you may fork, modify and publish the source under the same terms. Operating Narratage as a multi-tenant or hosted service, and supplying it to third parties for commercial gain, each require a commercial license. Content you produce with Narratage belongs to you.

For commercial licensing, email [official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry).
