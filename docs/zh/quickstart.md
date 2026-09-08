---
title: 面向 Agent 使用者的快速开始
description: 无需手写 SVML 或 SVS，通过 Coding Agent 创建、审阅并交付 Hypit 视频。
---

你不需要了解 SVML、SVS、JavaScript 或命令行。用日常语言向 Coding Agent 描述视频，Agent 会通过 `/hypit` skill 理解参考、设计内容、制作视频，并交付可继续修改的项目。

## 你需要准备什么

- 一个能够使用 skill 的 Coding Agent，例如 Claude Code 或 Codex；
- 一条用于复刻的视频，或一份用于原创视频的创意简报。

## 1. 安装 Hypit skill

先安装 Hypit skill：

```bash
npx skills add hypit-ai/hypit -g
```

然后在任意处启动 Coding Agent，Hypit skill 将全局可用。Skill 提供制作知识；Agent 会检查 Hypit 命令是否可用，并在需要时安装可执行工具。

### **👉 [免费获得 100 个拥有独特音色的 AI 人物形象](https://drive.google.com/drive/u/2/folders/18J9Fz7mkU3OQNJ-2Res3eIyFQ2cemIK5)**

## 2. 描述你想制作的视频

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/describe_the_video_you_want.mp4"></video>

你可以选择以下两种方式之一。

### 复刻一条参考视频

要求 Agent 复刻视频，并提供本地视频文件路径：

```text
/hypit 克隆这条视频：/path/to/video.mp4
```

你也可以直接提供在线视频平台的链接。Agent 会使用 `yt-dlp` 自动下载视频。例如：

```text
/hypit 克隆这条视频：https://www.youtube.com/watch?v=VIDEO_ID
/hypit 克隆这条视频：https://www.instagram.com/reel/REEL_ID/
```

如果需要改变内容，也可以一并说明，例如更换主持人、语言、产品、画幅比例、视觉风格或行动号召。参考视频会被当作剪辑结构的证据；Agent 不会只给你一份分析报告，而是会创建一套可以审阅、修改和 Build 的完整视频程序。

### 原创一条视频

你可以像给一位真人制片人写 brief 一样描述想法。例如：

```text
请制作一条 ranking 视频。视频中有一个 ranking 板子，包含五行：左侧是 S、A、B、C、D 五个等级，每个等级使用不同的颜色；右侧用于摆放对应等级的图标。把 Hypit 排到 S 级，并解释它的优势；同时加入 Arcads、Higgsfield、Seedance 和 CapCut，对每个竞品给出公平而简洁的优点与缺点说明。整体要清晰、有活力，适合短视频平台。
```

你还可以补充目标受众、时长、语言、语气、品牌色、主持人、发布平台或画幅比例等要求。Agent 会把 brief 转换成完整计划，并自行补全制作所需的细节。

## 3. 按 Agent 提示提供凭据

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/provide_credentials_when_the_agent_asks.mp4"></video>

在你描述视频之后，Agent 会检查项目需要哪些模型和服务。如果缺少必要凭据，Agent 会向你询问，并说明该凭据的用途。你可以选择两种方式：

1. **使用 Hypit 推荐的 hypit.ai OAuth 登录。** 告诉 Agent 通过 hypit.ai 登录。一次 OAuth 登录即可覆盖 Hypit 托管服务提供的所有模型，不需要为每个模型分别收集 key。
2. **使用你自己的 Provider key。** 你可以直接和 Agent 约定要使用哪些模型，并提供相应 Provider 的 API key。Agent 只会索取当前项目需要的 key，不会询问无关凭据。

不要把密钥粘贴到公开文档中，也不要提交到 Git。Agent 会使用已配置的安全凭据存储来保存这些凭据。

## 4. 让 Agent 完成制作

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/let_the_agent_do_the_production_work.mp4"></video>

Agent 会从你的目的出发理解参考视频，结合带时间的帧图和台词，弄清故事、节奏，以及字幕、B-roll、图形的作用与出现时机。换人或换产品的要求会从一开始影响剧本和设计。

它把这些决定写入项目文件，选择或编写合适的组件，用图片与视频模型制作素材，再按语义时间线编排。Studio 和局部渲染帮助检查版面、时机与可读性。已有素材会被复用；重要的决定、进展和问题会及时告诉你。

## 5. 在 Studio 查看编排

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/review_the_mock_studio.mp4"></video>

Studio 展示当前 Run 选定的素材、字幕和图形。Agent 可以用已有素材检查构图，也可以在生成素材后继续调整编排。

查看故事是否清楚、字幕是否易读、产品或 ranking 板是否突出、B-roll 是否放在合适的位置。直接描述你想要的改变：

```text
ranking 板出现得太晚，字幕太小。让板子跟着介绍排名的台词出现，并把字幕放大一些。
```

Agent 会修改对应部分，再展示更新后的画面。

## 6. 确认后提交付费 Build

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/approve_and_submit_the_paid_build.mp4"></video>

开始新的付费工作前，Agent 会说明所选模型、将要执行的外部工作和可查到的价格信息。你可以授权明确的制作范围：

```text
按这个方案生成素材并完成视频，预算在我们刚确认的范围内。
```

Agent 提交 Build 并跟进结果。已完成的素材和输出会保存在项目的 Result 中；出现失败时，它会说明原因，并在新的 Run 和 Build 中复用可用产物。

## 7. 查看成片

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/review_the_paid_result.mp4"></video>

Build 完成后，Agent 会提供最终视频及保存位置。查看内容、字幕、转场、构图和声音是否符合你的目标。需要修改时，直接告诉 Agent；项目保留可编辑的源码和已生成素材。

## 8. 继续用自然语言提出修改

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/request_natural_language_changes.mp4"></video>

Build 成功后，你仍然可以用对话继续指导项目。你可以更换主持人、替换 B-roll、改变 ranking 板的样式、翻译台词、调整语气或切换画幅比例。例如：

```text
保留台词和排名顺序，但把主持人换成沉稳的男主持，并把 ranking 板做成纸质体育杂志风格。
```

Agent 会把每项要求落实到对应的源码和组件，保留你要求不变的部分，并复用已有产物。新的付费生成遵循你授权的范围。

## 9. 并行制作多个变体

<video controls playsInline preload="metadata" width="100%" src="../quickstart/videos/create_multiple_variants_in_parallel.mp4"></video>

如果需要多个版本，先告诉 Agent 哪些维度可以变化。它会与你讨论具体方向，例如：

- 更换主持人的版本；
- 翻译成西班牙语的版本；
- 把产品卖点放到开头的版本；
- 加快剪辑、增加 B-roll 密度的版本。

Agent 会整理各版本共用的内容和各自的变化，为每个版本写出明确的制作选择。独立工作可以并发执行，具体并发量由运行配置控制；共用素材可显式复用。最终你会得到每个版本的成片、项目文件和完成情况。
