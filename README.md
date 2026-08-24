<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/hypit-logo-light.svg">
    <img alt="Hypit" src="./docs/public/hypit-logo-dark.svg" width="400" height="122">
  </picture>
</p>

<h3 align="center">Clone any viral video with AI agents</h3>
<p align="center">1 command, 100 variants, 100M views.</p>

<p align="center">
  <a href="https://narratage.hypit.ai/"><strong>Demo</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://narratage.hypit.ai/quickstart"><strong>Quickstart</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://narratage.hypit.ai/guide/develop"><strong>Develop</strong></a>
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
  <a href="https://narratage.hypit.ai/"><img alt="Visit our website" src="https://img.shields.io/badge/Visit%20our%20website-000000?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Join our Discord" src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white"></a>
  <a href="https://t.me/hypit"><img alt="Join our Telegram" src="https://img.shields.io/badge/Join%20our%20Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="Follow @hypitai on X" src="https://img.shields.io/badge/Follow%20%40hypitai-000000?style=for-the-badge&logo=x&logoColor=white"></a>
</p>

<p align="center">
  ⭐ <em>Help more people find Hypit and grow the community. Star this repo!</em>
</p>

## Hypit

Hypit gives AI agents (Claude Code, Codex...) a language and system to create video. Drop in a video, and your agent clones it as a complete workflow: footage, captions, B-roll and effects, all anchored to words instead of seconds.

**To be clear:** cloning a video is the fastest way in, not the only one. You can start from our templates, or just describe the video you want and your agent writes the workflow from scratch. Generation models are optional too: a workflow can compile captions, motion graphics and code-rendered visuals into a finished video without calling a single model, so a video can cost exactly $0.

### Street interview

<table>
  <tr>
    <th>Reference</th>
    <td></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" controls muted></video></td>
    <td></td>
  </tr>
  <tr>
    <th>Clones</th>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" controls muted></video></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" controls muted></video></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" controls muted></video></td>
  </tr>
</table>

### Podcast

<table>
  <tr>
    <th>Reference</th>
    <td></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" controls muted></video></td>
    <td></td>
  </tr>
  <tr>
    <th>Clones</th>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" controls muted></video></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" controls muted></video></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" controls muted></video></td>
  </tr>
</table>

## Install once

```bash
npx skills add hypit-ai/hypit -g
```

## Use the Hypit skill

The `/hypit` skill is available to coding agents. Start a session in any empty or existing project
directory and ask it to create videos for you:

```text
/hypit Clone this viral video, show me a preview, and guide me through producing variants.
```

Or start without a reference video:

```text
/hypit Create a video from my description, using templates and $0 code-rendered visuals wherever possible.
```

Your agent can check the environment, request only the credentials the video needs, preview the result, and build it.

## License

Hypit is released under the [Hypit Open Source License](./LICENSE). The videos and other outputs you create belong to you; third-party models and services may have their own terms.
