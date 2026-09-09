---
title: 面向 Agent 使用者的快速开始
description: 无需手写 SVML 或 SVS，通过 Coding Agent 创建、审阅并交付 Hypit 视频。
---

你不需要了解 SVML、SVS、JavaScript 或命令行。用日常语言向 Coding Agent 描述视频，Agent 会通过 `/hypit` skill 理解参考、设计内容、制作视频，并交付可继续修改的项目。

录屏用于展示对话和编辑操作。界面与个别命令可能有所不同，当前的使用方式请参照下文。

## 你需要准备什么

- 一个能够使用 skill 的 Coding Agent，例如 Claude Code 或 Codex；
- 一条用于复刻的视频，或一份用于原创视频的创意简报。

## 1. 安装 Hypit skill

先安装 Hypit skill：

```bash
npx skills add hypit-ai/hypit -g
```

然后在任意处启动 Coding Agent，Hypit skill 将全局可用。Skill 提供制作知识；Agent 会检查 Hypit 命令是否可用，并在需要时准备可执行工具，说明其中需要你选择的安装事项。

### **👉 [免费获得 100 个拥有独特音色的 AI 人物形象](https://drive.google.com/drive/u/2/folders/18J9Fz7mkU3OQNJ-2Res3eIyFQ2cemIK5)**

## 2. 描述你想制作的视频

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/describe_the_video_you_want.mp4"></video>

可以从一条想改编的参考视频开始，也可以从一个创意开始。

### 复刻一条参考视频

要求 Agent 复刻视频，并提供本地视频文件路径：

```text
/hypit 克隆这条视频：/path/to/video.mp4
```

你也可以直接提供在线视频平台的链接。对于支持的平台，Agent 会使用 `yt-dlp` 下载视频。例如：

```text
/hypit 克隆这条视频：https://www.youtube.com/watch?v=VIDEO_ID
/hypit 克隆这条视频：https://www.instagram.com/reel/REEL_ID/
```

如果需要改变内容，也可以一并说明，例如更换主持人、语言、产品、画幅比例、视觉风格或行动号召。Agent 会理解原片为什么有效，并根据你的目标改编剧本、人物表演和画面关系。你会得到成片和可继续编辑的项目。

### 原创一条视频

你可以像给一位真人制片人写 brief 一样描述想法。例如：

```text
请制作一条 ranking 视频。视频中有一个 ranking 板子，包含五行：左侧是 S、A、B、C、D 五个等级，每个等级使用不同的颜色；右侧用于摆放对应等级的图标。把 Hypit 排到 S 级，并解释它的优势；同时加入 Arcads、Higgsfield、Seedance 和 CapCut，对每个竞品给出公平而简洁的优点与缺点说明。整体要清晰、有活力，适合短视频平台。
```

你还可以补充目标受众、时长、语言、语气、品牌色、主持人、发布平台或画幅比例等要求。Agent 会把 brief 转换成完整计划，并自行补全制作所需的细节。

## 3. 选择项目使用的服务

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/provide_credentials_when_the_agent_asks.mp4"></video>

Agent 会先检查当前项目已有的工具和服务，说明缺少什么，并帮助你选择接入方式。对于有对白的参考视频，WhisperX 提供理解视频所需的转写和词时间。Agent 会检查本地是否已有可用环境；需要时，可以帮助准备本地环境，也可以使用你选择的托管服务。

你可以使用自己的 Provider 账号，也可以选择 HypiHub，通过一个账号使用托管转写和生成服务。告诉 Agent 你已经使用哪些服务，以及更倾向本地配置还是托管工具。确定连接某项服务后，它再打开登录。录屏展示的是 HypiHub 登录选项。

通过服务的登录或凭据配置完成连接。凭据保存在配置的凭据存储中，项目记录使用哪些服务。

## 4. 约定付费范围

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/approve_and_submit_the_paid_build.mp4"></video>

使用付费服务前，Agent 会说明使用的账号、准备执行的工作和可查到的价格信息。一起确定制作范围与预算，例如：

```text
使用我选定的账号完成这条视频，包括转写和素材生成，总预算不超过 5 美元。制作过程中及时告诉我进展。
```

这份授权覆盖约定范围内后续开展的工作。如果你只想先分析，就先授权分析；明确制作方向后，再估算制作费用。扩大范围、更换付费账号或超出预算时，再由你作出新的决定。

录屏展示如何确认一项制作请求。实际费用，以及哪些处理在本地或托管服务上执行，取决于当前项目选择的服务。

## 5. 让 Agent 制作视频

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/let_the_agent_do_the_production_work.mp4"></video>

Agent 会从你的目的出发理解参考视频，结合带时间的帧图和台词，弄清故事、节奏，以及字幕、B-roll、图形的作用与出现时机。换人或换产品的要求会从一开始影响剧本和设计。

它记录制作方向，写好图片和表演的 prompt，安排素材之间的参考关系。独立素材正在生成时，可以同时编写组件、准备编排。有对白的素材提供字幕与图形所依附的语义时间；纯动画也可以按自身的表达节奏安排时间。

实际素材到位后，Agent 检查版面、运动和时机如何配合，并调整相应组件。已有素材保留用于复用；创作决定、进展和问题会及时告诉你。

Build 会保存已完成的素材和输出。如果某次执行失败，Agent 会说明情况，并在约定范围内通过新的 Run 和 Build 使用已有成果继续制作。

## 6. 查看成片

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/review_the_paid_result.mp4"></video>

Build 完成后，Agent 会提供最终视频及保存位置。查看内容、字幕、转场、构图和声音是否符合你的目标。需要修改时，直接告诉 Agent；项目保留可编辑的源码和已生成素材。

### 在 Studio 里了解可编辑项目

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/review_the_mock_studio.mp4"></video>

交付成片时，Agent 也可以打开 Studio，展示这条视频的可编辑编排。你可以通过预览、时间线和属性面板，了解素材、字幕与图形如何配合。

录屏用占位素材展示时间线和编辑界面。在你的项目里，Agent 会打开选用了实际制作素材的 Run。远程协作时，也可以通过截图或短录屏了解项目。

你可以提出具体要求，例如：

```text
让 ranking 板跟着介绍排名的台词出现，并把字幕放大一些。
```

Agent 会修改对应的源码或组件，并检查更新后的编排。

## 7. 继续用自然语言提出修改

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/request_natural_language_changes.mp4"></video>

Build 成功后，你仍然可以用对话继续指导项目。你可以更换主持人、替换 B-roll、改变 ranking 板的样式、翻译台词、调整语气或切换画幅比例。例如：

```text
保留台词和排名顺序，但把主持人换成沉稳的男主持，并把 ranking 板做成纸质体育杂志风格。
```

Agent 会把每项要求落实到对应的源码和组件，保留你要求不变的部分，并复用已有产物。新的付费生成遵循你授权的范围。

## 8. 并行制作多个变体

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/create_multiple_variants_in_parallel.mp4"></video>

如果需要多个版本，先告诉 Agent 哪些维度可以变化。它会与你讨论具体方向，例如：

- 更换主持人的版本；
- 翻译成西班牙语的版本；
- 把产品卖点放到开头的版本；
- 加快剪辑、增加 B-roll 密度的版本。

Agent 会整理各版本共用的内容和各自的变化，为每个版本写出明确的制作选择。独立工作可以并发执行，具体并发量由运行配置控制；共用素材可显式复用。最终你会得到每个版本的成片、项目文件和完成情况。
