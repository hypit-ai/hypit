---
title: Agent 用户快速开始
description: 从参考视频出发，为你的人物、产品和受众制作新视频。
---

# 和 Agent 一起制作视频

带来一条你喜欢的视频，告诉 Agent 想怎么改：换成你的脸、你的产品，面向新的受众，或再做一个变体。Hypit 提供制作知识与工具，让它理解参考片、制作素材，并编排出可以继续编辑的视频。

## 你需要准备

- 支持 Skill 的 Coding Agent，例如 Claude Code 或 Codex。
- 参考视频，或对目标视频的描述。

## 1. 安装 Hypit Skill

```bash
npx skills add hypit-ai/hypit -g
```

在 Agent 中打开你的视频项目。Skill 提供制作知识，`hypit` 包提供可执行工具。Agent 会检查已有安装，协助准备缺少的工具。你无需克隆 Hypit 仓库。

## 2. 提供参考，说明想改什么

把视频文件或支持的平台链接交给 Agent，也可以附上人物照片、产品或品牌素材：

```text
/hypit 参考这个视频：/path/to/video.mp4。
把产品换成 Hypit（hypit.ai），保留抓人的开场和 Ranking 呈现方式。
```

人物、产品、语言、画幅和行动号召都可以调整。Agent 会理解原片为什么有效，包括图形、字幕如何落在具体词语上，再根据你的目标改写剧本、设计画面。理解和决定会记进项目，制作过程中也会向你说明作品的方向与进展。

### **👉 [免费领取 100 个拥有独特音色的 AI 人物](https://drive.google.com/drive/u/2/folders/18J9Fz7mkU3OQNJ-2Res3eIyFQ2cemIK5)**

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-10/clone_a_video_with_your_product.mp4"></video>

## 3. 选择你想使用的服务

Agent 会先检查相关工具与已有服务。对于有对白的参考视频，WhisperX 提供词语及其时间，帮助 Agent 把画面变化和说话内容联系起来。缺少时，Agent 可以协助在本机准备，也会说明托管选项。

[HypiHub](https://hypit.ai) 通过一个账户提供托管 WhisperX 和图片、视频、音色模型。你也可以通过支持的 Provider 使用自己的 Key，或组合本地与托管能力。Agent 会解释需要什么，再协助连接你选择的服务。

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-10/log_in_to_hypit_or_bring_your_own_key.mp4"></video>

## 4. 确认费用，开始制作

付费工作开始前，Agent 会说明使用哪个账户、准备做什么、可用费率或预计费用，以及还不确定的部分。确认制作范围和预算后，约定覆盖的调用就可以连续推进。更换账户、扩大范围或超出预算时，再由你决定。

```text
用我的 HypiHub 账户完成这条视频，按我们确认的预算推进，开始吧。
```

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-10/check_the_quote_and_approve.mp4"></video>

Agent 会从一开始写好剧本、表演方向和图片参考关系，让生成素材承载明确的创作意图。等待生成时，可以同时制作图形与字幕。Hypit 将执行情况和产物保存在 Build Result 中；Agent 随制作进展向你说明情况。

## 5. 看成片，继续修改与创作

真实素材到位后，Agent 会检查版面、字幕、图形和 B-roll 是否清楚、时机是否恰当。交付视频时，也可以打开 Studio，让你浏览时间线、调整支持的属性。

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-10/watch_the_finished_video.mp4"></video>

继续对话就能修改作品或制作变体。仍适用的素材会继续复用，Agent 调整相关剧本、组件或位置。项目保存在普通文件里，可以继续编辑。

进一步了解：[与 Agent 一起制作视频](./guide/skill.md)、[Run 与 Build](./quickstart/run.md)、[Studio](./quickstart/preview.md)。
