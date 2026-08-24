<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/hypit-logo-light.svg">
    <img alt="Hypit" src="./docs/public/hypit-logo-dark.svg" width="400" height="122">
  </picture>
</p>

<h3 align="center">让 AI Agent 复刻任何爆款视频</h3>
<p align="center">一条命令，100 个变体，1 亿播放量。</p>

<p align="center">
  <a href="https://narratage.hypit.ai/zh/"><strong>Demo</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://narratage.hypit.ai/zh/quickstart"><strong>快速开始</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://narratage.hypit.ai/zh/guide/develop"><strong>开发指南</strong></a>
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
  <a href="https://narratage.hypit.ai/zh/"><img alt="Visit our website" src="https://img.shields.io/badge/Visit%20our%20website-000000?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Join our Discord" src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white"></a>
  <a href="https://t.me/hypit"><img alt="Join our Telegram" src="https://img.shields.io/badge/Join%20our%20Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="Follow @hypitai on X" src="https://img.shields.io/badge/Follow%20%40hypitai-000000?style=for-the-badge&logo=x&logoColor=white"></a>
</p>

<p align="center">
  ⭐ <em>让更多人发现 Hypit，一起壮大社区。给仓库点个 Star！</em>
</p>

## Hypit

Hypit 给 AI Agents (Claude Code、Codex……) 打造了一门做视频的语言和系统。丢一条视频进来，Agent 把它克隆成一份完备的 workflow：画面、字幕、B-roll、特效，全部挂在词上，不钉在秒上。

**说明一点：** 复刻视频是最快的入口，但不是唯一的入口。你可以直接从我们的模板开始，也可以直接描述你想要的视频，让 Agent 从零写出一份 workflow。生成模型同样不是必需的：字幕、动效、代码渲染的画面，不调用任何模型也能编译成一条成片——一条视频的成本可以是 0 元。

### 街头采访

<table>
  <tr>
    <td colspan="3"><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" width="100%" controls muted loop></video></td>
  </tr>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" width="100%" controls muted loop></video></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" width="100%" controls muted loop></video></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" width="100%" controls muted loop></video></td>
  </tr>
</table>

### 播客

<table>
  <tr>
    <td colspan="3"><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" width="100%" controls muted loop></video></td>
  </tr>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" width="100%" controls muted loop></video></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" width="100%" controls muted loop></video></td>
    <td><video src="https://github.com/user-attachments/assets/45ae9d58-6da4-495f-914b-aa6d2b60f1f9" width="100%" controls muted loop></video></td>
  </tr>
</table>

## 只安装一次

```bash
npx skills add hypit-ai/hypit -g
```

## 使用 Hypit skill

编程 Agent 可以直接使用 `/hypit` skill。在任何空目录或现有项目目录里开启会话，让 Agent
为你创建视频：

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
