<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/hypit-logo-light.svg">
    <img alt="Hypit" src="./docs/public/hypit-logo-dark.svg" width="400" height="122">
  </picture>
</p>

<h3 align="center">Clone any viral video with AI agents</h3>
<p align="center">1 command, 100 variants, 100M views.</p>

<p align="center">
  <a href="https://hypit.ai"><strong>Demo</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://hypit.ai/quickstart/"><strong>Quickstart</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://hypit.ai/guide/develop/"><strong>Develop</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/229030"><img alt="Trendshift #1 Repository of the Day" src="https://trendshift.io/api/badge/trendshift/repositories/229030/daily"></a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/229030"><img alt="Trendshift #1 TypeScript Repository of the Day" src="https://trendshift.io/api/badge/trendshift/repositories/229030/daily?language=TypeScript"></a>
  <a href="https://trendshift.io/repositories/229030?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-229030" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/229030/weekly?language=TypeScript" alt="hypit-ai/hypit | Trendshift TypeScript Weekly" width="250" height="55"></a>
</p>

<p align="center">
  <img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/hypit?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars">
  <a href="./package.json"><img alt="Node 22.15+" src="https://img.shields.io/badge/Node.js-22.15%2B-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./package.json"><img alt="pnpm 10.33" src="https://img.shields.io/badge/pnpm-10.33-F69220?style=flat-square&logo=pnpm&logoColor=white"></a>
  <a href="./package.json"><img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-E3B341?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://hypit.ai"><img alt="Visit our website" src="https://img.shields.io/badge/Visit%20our%20website-DF3C68?style=for-the-badge&logo=hypit&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Join our Discord" src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white"></a>
  <a href="https://t.me/hypitai"><img alt="Join our Telegram" src="https://img.shields.io/badge/Join%20our%20Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="Follow @hypitai on X" src="https://img.shields.io/badge/Follow%20%40hypitai-000000?style=for-the-badge&logo=x&logoColor=white"></a>
</p>

<p align="center">
  ⭐ <em>Help more people find Hypit and grow the community. Star this repo!</em>
</p>

## Hypit

Hypit gives AI agents (Claude Code, Codex...) a language and system to create video. Drop in a video, and your agent clones it as a complete workflow: footage, captions, B-roll and effects, all anchored to words instead of seconds.

**To be clear:** cloning a video is the fastest way in, not the only one. You can start from our templates, or just describe the video you want and your agent writes the workflow from scratch. Generation models are optional too: a workflow can compile captions, motion graphics and code-rendered visuals into a finished video without calling a generation model or incurring its service charges.

![SVML source and live video preview](https://github.com/user-attachments/assets/981c28e8-ddab-4164-85bc-03b5d71275dc)

<p align="center"><em>SVML source on the left, with the corresponding video rendered live on the right.</em></p>

## Install once

```bash
npx skills add hypit-ai/hypit -g
```

This installs the Skill. On first use, your agent checks for the Hypit executable and helps prepare
it if needed. Your video project can live anywhere.

Hypit is free to use; your Coding Agent and model services have their own accounts and charges.
HypiHub is our recommended hosted model service. You can also use your own API or local models;
tell your agent the service name and API documentation so it can set up the appropriate connection.

[Agent environments and entry partners](./docs/guide/agents.md) ·
[Model and deployment services](./docs/guide/service-partners.md)

## Examples

### UGC

[Generation source](examples/ranking-football/reference.svml) · [Run and production notes](examples/ranking-football/README.md)

<table>
  <tr>
    <th width="16%">Reference</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/f573bdac-62da-4b5d-825d-54d5880a7026" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">Clones</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/3ffd9951-e423-4a48-ad8f-5c596627be69" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/eb62372d-2464-4a4b-83ee-41e227f99a8e" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/9ba050f6-355d-460c-b684-7344cf49c051" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>"GOAT DEBATE"</b> — a 20-second football tier list that puts Ronaldo in D and Messi in S. Two Seedance 2 Mini 720p trolling A-rolls, a 2K goth girl portrait and ten 1K brain-rot B-rolls by GPT Image 2, WhisperX word alignment, a sound-synced ranking board, color-box karaoke captions, buttery-smooth animation and catchy background music, concurrently rendered in 64 headless Chromium processes.</p><p>Three clones included: swap the narrator to banana cat, flip the rankings and Ronaldo becomes GOAT, or replace all players with tech founders — same viral structure, different viral video.</p><p>Total cost: <b>$1.15</b>.</p></td>
  </tr>
</table>

### Podcast

[Generation source](examples/podcast/reference.svml) · [Run and production notes](examples/podcast/README.md)

<table>
  <tr>
    <th width="16%">Reference</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/22df72b8-4831-4eb6-957d-676ae9b04f2d" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">Clones</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/9c14c5ae-bd12-4961-9d57-a46d3a2154c6" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/f44c653b-f520-4715-9530-4c2f42114387" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/92f9bf8b-4f83-4d9b-a0e8-ca27fab2cc94" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>"DAILY CREATINE"</b> — an 18-second podcast clip where a muscle barbie forces creatine on a skinny college kid. Three confrontational A-rolls and an aspirational lifestyle B-roll by Seedance 2 Mini 720p, two 2K AI character portraits and three 1K montage panels by GPT Image 2, WhisperX word alignment, split-screen interview layout, speaker-aware karaoke captions, a product-handoff moment and background music, concurrently rendered in 64 headless Chromium processes.</p><p>Three clones included: swap both hosts to Pepe and Doge arguing about doggy arms, replace the creatine with retinol where a pretty boy roasts a tomboy's pores, or ditch the physical product for a CheatGPT app where a himbo jock out-GPAs a PhD student — same podcast format, three ad verticals.</p><p>Total cost: <b>$1.07</b>.</p></td>
  </tr>
</table>

### Street Interview

[Generation source](examples/interview/reference.svml) · [Run and production notes](examples/interview/README.md)

<table>
  <tr>
    <th width="16%">Reference</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/666ad535-3231-44fb-b9bc-271817ae79de" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">Clones</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/c39a0425-2dcb-4709-b894-6a9423d351e3" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/8f71552c-0ad1-4d29-8c4e-3b937ab7c887" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/d9cab2e7-e08b-48ef-8d25-bc28ca9efc17" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>"NICE RIDE"</b> — a 26-second street interview where a mob wife drops three rules for making her first million. Three A-rolls by Seedance 2 Mini 720p, one 2K AI character portrait by GPT Image 2, WhisperX word alignment, head-tracked speaker-colored captions driven by face bounding boxes from Google Video Intelligence and YOLOv8 AnimeFace, a sound-synced emoji reveal board with color flashes and reveal sound effects, plus background music, concurrently rendered in 64 headless Chromium processes.</p><p>Three clones included: swap hosts to Wojak and Chad, translate everything to Spanish with exactly the same punchlines, or swap the Lambo for an F1 car where Ada explains to Leon how driving Uber led to an accidental Grand Prix win — same three-stage reveal, distinct street-interview remixes.</p><p>Total cost: <b>$1.09</b>.</p></td>
  </tr>
</table>

## Use the Hypit skill

The `/hypit` skill is available to coding agents. Start a session in any empty or existing project
directory and ask it to create videos for you:

```text
/hypit Clone this video: /path/to/video.mp4, and replace the ranking content with a comparison of Hypit (official website: hypit.ai) with other AI video products.
```

Or start without a reference video:

```text
/hypit Make a ranking video that puts Hypit in S tier.
```

Your agent can check the environment, request the credentials the video needs, generate the material, and build the finished composition.

### **👉 [Get 100 FREE AI Avatars with unique voices](https://drive.google.com/drive/u/2/folders/18J9Fz7mkU3OQNJ-2Res3eIyFQ2cemIK5)**

## Why Hypit

- **Clone any video:** drop in a video, get the whole workflow — footage, captions, B-roll, effects. Not a script breakdown.
- **One workflow, 100 variants:** reuse the composition and existing material; generate the parts that change.
- **Pluggable components:** swap the host without touching the captions. Use the library, fork it, or write your own.
- **Open source:** no Hypit seat pricing, per-render fees or added watermark. Model-service usage is billed by the service you choose.

## What Hypit Can Build

Drop in a video and your agent clones the whole workflow — or describe what you want and it writes one from scratch. Either way you get an editable, re-runnable composition, not a one-off render.

- **Paid social ads** — clone a winning ad from the Meta Ad Library, swap in your product, ship 50 hook variants the same day. When it fatigues in two weeks, re-run with fresh openings; the body never changes.
- **Viral clones** — any TikTok, Reel, or Short becomes a template. Swap the host, the hook, the product, the language, the aspect ratio.
- **TikTok Shop and affiliate videos** — one format that converts, a new SKU every day. Swap the product, the price, the CTA; the structure that worked stays untouched.
- **AI UGC and talking heads** — narration, word-level captions, B-roll, comment stickers, beat-synced cuts, all wired automatically.
- **Podcast and interview clips** — split-screen layouts, speaker-aware captions, reaction overlays.
- **Code-rendered videos** — visuals driven entirely by front-end code, rendered locally without generation API calls.
- **Localized versions** — the same video in ten languages. Rewrite a line and the timing re-flows itself.

## Stay Tuned with Us

Star us, and you will receive all release notifications from GitHub without any delay!

![Stay tuned with us](https://github.com/user-attachments/assets/cc929974-96b8-4166-b81d-008e130b0f24)

## How to Contribute

Pull requests are welcome, and documentation, examples and translations count as much as code. Pick
up an open issue or open one for what you want to work on, and we will help you land it.
[CONTRIBUTING.md](./CONTRIBUTING.md) has the setup, the checks CI runs and the pull request flow.

Creating a component is ordinary video-production work, and the component normally stays with the
video project that owns it. When its owner wants to share it, the same package can be handed off as
a versioned tarball or published under the owner's npm scope or private registry. Proposals for a
component maintained in Hypit's official Distribution begin with an issue describing the shared
product need; official inclusion is separate from normal community sharing.

The [Development Guide](https://hypit.ai/guide/develop/) covers the prerequisites, the daily
commands and the repository layout.

<table>
  <tr>
    <td>Bug reports</td>
    <td><a href="https://github.com/hypit-ai/hypit/issues/new?template=bug_report.yml">Open an issue</a></td>
  </tr>
  <tr>
    <td>Feature requests</td>
    <td><a href="https://github.com/hypit-ai/hypit/issues/new?template=feature_request.yml">Open an issue</a></td>
  </tr>
  <tr>
    <td>Questions</td>
    <td><a href="https://discord.gg/85hnyQnxpn">Discord</a> or <a href="https://t.me/hypitai">Telegram</a></td>
  </tr>
</table>

## Launch Partners

<table>
  <tr>
    <td width="220" align="center">
      <a href="https://watcha.cn/r/geIiJJ">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/watcha-dark.png">
          <img alt="Watcha" src="./docs/public/watcha-light.png" width="170">
        </picture>
      </a>
    </td>
    <td><a href="https://watcha.cn/r/geIiJJ">Watcha</a> is an innovative ecosystem and community built for AI builders, connecting great products with high-quality users to turn every Demo into reality. Starting from AI product discovery and genuine feedback, Watcha provides product publishing, distribution, and reputation tracking to support builders from launch to early adoption.</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://tokendance.space/?utm_source=hypit">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/tokendance-dark.png">
          <img alt="TokenDance" src="./docs/public/tokendance-light.png" width="165">
        </picture>
      </a>
    </td>
    <td><a href="https://tokendance.space/?utm_source=hypit">TokenDance</a> offers builders a unified multi-model gateway with optimized inference costs. Through programs like the Billion-Token Subsidy and the Developer Program, TokenDance helps early-stage builders cut costs so they can focus on product validation and growth.</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://autoclaw.z.ai"><img alt="AutoClaw" src="./docs/public/autoclaw.png" width="180"></a>
    </td>
    <td><a href="https://autoclaw.z.ai">AutoClaw</a> is Z.ai’s desktop AI assistant for work, deeply optimized for GLM models and integrated with specialized knowledge bases and workflows for legal, finance, design, and more.</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://openagents.org/blog/posts/2026-09-08-pilot-user-program-zh-hypit"><img alt="OpenAgents" src="./docs/public/openagents.png" width="180"></a>
    </td>
    <td><a href="https://openagents.org">OpenAgents Workspace</a> is a product that helps you manage AI agents, allowing you to invoke agents running on any device (whether on a mobile phone or computer) anytime, anywhere. Agents can collaborate within the platform to help you complete tasks and boost efficiency. It currently supports integration with over 20 types of agents, including Claude, Codex, OpenClaw, and Hermes.</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://monid.ai?fpr=alvin-45480b">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/monid-logo-white.svg">
          <img alt="Monid" src="./docs/public/monid-logo-blue.svg" width="150">
        </picture>
      </a>
    </td>
    <td><a href="https://monid.ai?fpr=alvin-45480b">Monid</a> is the OpenRouter for agent tools: one key, one wallet, hundreds of tools, billed per call. Hypit can route Seedance video, images, speech and word-level transcription to Monid.</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://www.hiapi.ai/invite/hypit"><img alt="HiAPI" src="./docs/public/hiapi.png" width="165"></a>
    </td>
    <td><a href="https://www.hiapi.ai/invite/hypit">HiAPI</a> is a unified API platform for AI image, video, audio, and language models. Connect GPT Image 2.5, Seedance 2.0, Veo 3.1, Kling, Wan, and other popular models through one platform. Pay as you go with no monthly fee, with free trial credits available for new users.</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://api.pollo.ai/?utm_source=hypit"><img alt="Pollo API" src="./docs/public/pollo.jpg" width="120"></a>
    </td>
    <td><a href="https://api.pollo.ai/?utm_source=hypit">Pollo API</a> gives developers access to 300+ AI image and video models through a single API, with competitive rates. One API key connects you to multiple model providers and scales from 10 to 10,000+ requests.</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://beatapi.io/sign-up?aff=hypit"><img alt="BeatAPI" src="./docs/public/beatapi.png" width="165"></a>
    </td>
    <td><a href="https://beatapi.io/sign-up?aff=hypit">BeatAPI</a> is the professional capability layer for any agent. We provide AI models, real-world data, task-ready capabilities, and professional workspaces that help agents complete real-world tasks.</td>
  </tr>
</table>

## ⭐ Star History

<a href="https://www.star-history.com/?repos=hypit-ai%2Fhypit&type=date&logscale=&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=hypit-ai/hypit&type=date&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=hypit-ai/hypit&type=date&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=hypit-ai/hypit&type=date&legend=bottom-right" />
 </picture>
</a>

## Contributors

<a href="https://github.com/hypit-ai/hypit/graphs/contributors">
  <img alt="Contributors" src="https://contrib.rocks/image?repo=hypit-ai/hypit">
</a>

## License

Hypit is released under the [Hypit Open Source License](./LICENSE). The videos and other outputs you create belong to you; third-party models and services may have their own terms.

Partnership Community: [LINUX DO](https://linux.do/)
