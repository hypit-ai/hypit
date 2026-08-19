<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/hypit-logo-light.png">
    <img alt="Hypit" src="./docs/public/hypit-logo-dark.png" width="400" height="78">
  </picture>
</p>

<p align="center">
  <strong>让 AI Agent 复刻任何爆款视频。</strong>
  <br>
  <em>一条命令，100 个变体，1 亿播放量。</em>
</p>

<p align="center">
  <a href="https://hypit.ai/"><strong>官网</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://narratage.hypit.ai/zh/"><strong>文档</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://discord.gg/85hnyQnxpn"><strong>Discord</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="./README.md"><strong>English</strong></a>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/hypit/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/hypit?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars"></a>
  <a href="./package.json"><img alt="Node 22+" src="https://img.shields.io/badge/Node.js-22+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./package.json"><img alt="pnpm 10.33" src="https://img.shields.io/badge/pnpm-10.33-F69220?style=flat-square&logo=pnpm&logoColor=white"></a>
  <a href="./package.json"><img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-E3B341?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://hypit.ai/zh/"><img alt="Visit our website" src="https://img.shields.io/badge/Visit%20our%20website-000000?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Join our Discord" src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white"></a>
  <a href="https://t.me/hypit"><img alt="Join our Telegram" src="https://img.shields.io/badge/Join%20our%20Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="Follow @hypitai on X" src="https://img.shields.io/badge/Follow%20%40hypitai-000000?style=for-the-badge&logo=x&logoColor=white"></a>
</p>

## Hypit

让 AI Agent 复刻任何爆款视频。交付的不仅仅是拆解的脚本，而是一份 workflow：可以换脸、换词、换 B-roll，一次跑出 50 个变体，拿下你的 1 亿播放。

Hypit 为 AI Agent（Claude Code、Codex……）提供一套创作视频的语言与系统。丢进一条视频，Agent 会把它复刻成完整 workflow：画面、字幕、B-roll 和特效，全部锚定在具体文字上，而不是秒数上。

**明确一点：**复刻视频是最快的上手方式，但不是唯一方式。你可以从模板开始，也可以直接描述想要的视频，让 Agent 从零写出 workflow。生成模型同样可选：workflow 可以在不调用任何生成模型的情况下，把字幕、motion graphics 和代码渲染画面编译成完整视频，因此一条视频的生成成本可以恰好是 $0。

## 安装

需要 Node.js 22+ 与 pnpm 10.33.x。

```bash
git clone https://github.com/hypit-ai/hypit.git
cd hypit
corepack enable
pnpm install --frozen-lockfile
npm link
```

构建最终视频需要安装 `ffmpeg` 和 `ffprobe`。部分可选 Provider 还可能需要 Python、`uv` 或 API 凭据。

## 使用 Hypit skill

克隆仓库后，编程 Agent 可以直接使用 `/hypit` skill。让 Agent 配置环境并为你创建视频：

```text
/hypit 把这条爆款视频复刻出来，展示预览，并带我批量生成多个变体。
```

也可以不提供参考视频，直接从描述开始：

```text
/hypit 根据我的描述创建视频，优先使用模板和成本为 $0 的代码渲染画面。
```

Agent 会检查环境，只索取视频实际需要的凭据，展示预览并执行构建。

## 许可证

Hypit 采用 [Hypit 开源许可证](./LICENSE)。你创作的视频和其他产出归你所有；第三方模型与服务可能另有条款。
