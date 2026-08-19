<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/hypit-logo-light.png">
    <img alt="Hypit" src="./docs/public/hypit-logo-dark.png" width="400" height="78">
  </picture>
</p>

<p align="center">
  <strong>Clone any viral video with AI agents.</strong>
  <br>
  <em>1 command, 100 variants, 100M views.</em>
</p>

<p align="center">
  <a href="https://hypit.ai/"><strong>Website</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://narratage.hypit.ai/"><strong>Docs</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://discord.gg/85hnyQnxpn"><strong>Discord</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

## What Hypit does

Clone any viral video with AI agents. Not just a script, the whole workflow: swap the face, the words, the B-roll, ship 100 variants in one run, and get your 100M views.

## 30-second intro

Hypit gives AI agents (Claude Code, Codex...) a language and system to create video. Drop in a video, and your agent clones it as a complete workflow: footage, captions, B-roll and effects, all anchored to words instead of seconds.

To be clear: cloning a video is the fastest way in, not the only one. You can start from our templates, or just describe the video you want and your agent writes the workflow from scratch. Generation models are optional too: a workflow can compile captions, motion graphics and code-rendered visuals into a finished video without calling a single model, so a video can cost exactly $0.

## Install

Requires Node.js 22+ and pnpm 10.33.x.

```bash
git clone https://github.com/hypit-ai/hypit.git
cd hypit
corepack enable
pnpm install --frozen-lockfile
npm link
```

For finished video builds, install `ffmpeg` and `ffprobe`. Some optional providers may also require Python, `uv`, or API credentials.

## Use the Hypit skill

The `/hypit` skill is available to coding agents from the cloned repository. Ask your agent to set up the environment and create the workflow for you:

```text
/hypit Clone this viral video into a reusable workflow, show me a preview, and guide me through producing variants.
```

Or start without a reference video:

```text
/hypit Create a video workflow from my description, using templates and $0 code-rendered visuals wherever possible.
```

Your agent can check the environment, request only the credentials the chosen workflow needs, preview the result, and run the build.

## License

Hypit is released under the [Hypit Open Source License](./LICENSE). The videos and other outputs you create belong to you; third-party models and services may have their own terms.
