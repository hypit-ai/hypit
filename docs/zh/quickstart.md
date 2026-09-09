---
title: 面向 Agent 使用者的快速开始
description: 通过 Coding Agent 复刻一条视频，共五步。
---

用日常语言描述你要的视频，其余交给 Agent 和 `/hypit` skill。

## 你需要准备什么

- 一个能够使用 skill 的 Coding Agent，例如 Claude Code 或 Codex；
- 一条参考视频。

## 1. 安装 Hypit skill

```bash
npx skills add hypit-ai/hypit -g
```

在任意位置启动 Coding Agent。首次使用时，Agent 会自行安装 Hypit 工具。

### **👉 [免费获得 100 个拥有独特音色的 AI 人物形象](https://drive.google.com/drive/u/2/folders/18J9Fz7mkU3OQNJ-2Res3eIyFQ2cemIK5)**

## 2. 复刻一条视频，换成你的产品

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/clone_a_video_with_your_product.mp4"></video>

给 Agent 一个文件或链接，并说明要改什么：

```text
/hypit 克隆这条视频：/path/to/video.mp4，把产品换成 Hypit（hypit.ai）。
```

YouTube、Instagram 等平台链接都可以，Agent 会自动下载。主持人、产品、语言、画幅、行动号召，都可以在同一句话里说明。

## 3. 登录 Hypit，或使用自己的 key

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/log_in_to_hypit_or_bring_your_own_key.mp4"></video>

模型需要凭据时，Agent 会向你索要。登录一次 hypit.ai 即可使用 Hypit 托管的全部模型；也可以把你偏好的 Provider 的 API key 交给 Agent。凭据保存在系统凭据存储中。

## 4. 查看报价，批准生成

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/check_the_quote_and_approve.mp4"></video>

花钱之前，Agent 会列出每一项付费请求及其价格。批准后，它提交 Build：

```text
开始。
```

## 5. 查看成片

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/watch_the_finished_video.mp4"></video>

Agent 交付视频，并在 Studio 中展示给你。如果还有修改意见，继续与 Agent 沟通即可。
