<p align="center">
  <img alt="Narratage" src="docs/public/narratage-logo.svg" width="420">
</p>

<p align="center"><strong>一门给 AI Agent 做视频用的语言和系统。</strong></p>

<p align="center"><em>人剪视频，Agent 编译视频。</em></p>

<!-- TODO: Demo GIF（15秒内）—— 左边 SVML 剧本，右边编译出的视频。 -->

<p align="center">
  <a href="https://narratage.hypit.ai/zh/">演示</a>&nbsp;&nbsp;<a href="https://narratage.hypit.ai/zh/quickstart">快速开始</a>&nbsp;&nbsp;<a href="https://narratage.hypit.ai/zh/guide/develop">开发</a>&nbsp;&nbsp;<a href="./README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/narratage/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/narratage?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars"></a>
  <a href="./package.json"><img alt="Node 22+" src="https://img.shields.io/badge/node-22+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-yellow?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://narratage.hypit.ai/zh/"><img alt="Website" src="https://img.shields.io/badge/Website-narratage.hypit.ai-000000?style=flat-square&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="X" src="https://img.shields.io/badge/Follow-%40hypitai-000000?style=flat-square&logo=x&logoColor=white"></a>
  <a href="https://t.me/narratage"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-Join%20Group-26A5E4?style=flat-square&logo=telegram&logoColor=white"></a>
</p>

## 为什么是 Narratage

每一款视频编辑器——Premiere、剪映、DaVinci、Final Cut——都是为人的双手在时间线上操作而造的。Narratage 是一门为 AI Agent 设计的语言与系统。

- **没有时间线** —— 视频是写出来的，不是拖出来的。B-roll、特效以及每一条轨道都存在于源码里。
- **Agent 原生** —— 输入纯文本，输出成片。Agent 像读写代码一样读写它。
- **钉在词上** —— 重新生成一个段落，时间随之改变——而 B-roll 与特效始终钉在它们所属的词上。
- **可批量** —— 一切都是源文件。以代码的规模产出视频，而不是以剪辑的速度。

## 怎么工作的

Narratage 把 SVML 源文件编译成成片。

1. **写** —— SVML 描述谁在说话、说什么，以及 B-roll 与特效放在哪里。不含时间码。
2. **生成** —— Seedance、MiniMax H3 与 GPT Image 2 依据提示词和参考图产出每一个镜头。
3. **对齐** —— WhisperX 把每一个说出口的词钉到精确的时间上。B-roll 与特效跟随词，而不是跟随秒。
4. **渲染** —— HyperFrames 把所有轨道逐帧合成为 MP4。

改动剧本，保留你已认可的结果，只重新生成你选择替换的那部分。

## 语言

SVML——Semantic Video Markup Language——是创作语言。Narratage 是围绕它的编译器、运行时与包生态。

一个完整的 `.svml` 文件：

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

四个构造，这就是全部：

| 构造 | 写法 | 干什么 |
|---|---|---|
| **Segment** | `<intro>...</intro>` | 命名的叙事段落——知道自己是段落的段落 |
| **Speaker** | `<HOST>` | 标注谁在说话；一直生效到下一个 cue 或段落结束 |
| **Split** | `<$299 \| two ninety-nine>` | 屏幕上显示的和嘴里说的可以不一样 |
| **Hook** | `@product...@/product` | 把一个画面——B-roll、图形、特效——钩到具体的词上 |

Script 外面的组件（视频生成器、语音模型、字幕渲染器、轨道合成器）消费 Script 声明的内容。Script 本身不含任何渲染逻辑。完整语法：[Script 规范](https://narratage.hypit.ai/zh/quickstart/script)。

## 快速开始

### 克隆仓库

```bash
git clone https://github.com/hypit-ai/narratage.git
cd narratage
```

### 用编程 Agent

在这个工作目录下就可以直接使用 `/narratage`。发送给你的 Agent：

```text
/narratage 配置我的环境，只向我索取当前 Runtime Profile 实际需要的 API key，然后带我完成第一支 SVML 视频的创作与 Build。
```

### 从终端

需要 Node.js 22+ 与 pnpm 10.33.x：

```bash
corepack enable
pnpm install --frozen-lockfile

node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock
```

`check` 校验源码并打印类型化输出。`plan` 展示被真正需要的执行子图，以及一次真实 Build 会用到的每一项外部能力——但不会启动其中任何一项。

真实的 Build 还需要 `PATH` 上有 `ffmpeg` 与 `ffprobe`，以及视 Runtime Profile 而定的 Python 与 `uv` 或 API 凭据。运行 `narratage doctor` 查看缺什么；完整指南见[快速开始](https://narratage.hypit.ai/zh/quickstart)。

### 项目文件

Narratage 把创作与执行分开：

| 文件 | 决定什么 |
|---|---|
| `.svml` | 制作什么视频，包括稿件、生成素材和轨道 |
| `.svs` | 可复用的创作选择，例如 prompt、样式和布局 |
| `.svrun` | 本次构建什么，包括 Target 和需要复用的历史产物 |
| Runtime Profile | 在哪里、以何种方式运行，包括 Provider、存储和并发 |

一个项目可以包含任意数量的这些文件，同一份 `.svml` 也可以由多份 `.svrun` 构建。

## 名字的由来

<p align="center"><em>narration + montage = <strong>narratage</strong></em></p>

> “The new treatment, which the producer calls ‘narratage,’ is eminently well suited to this particular dramatic vehicle.”
>
> Mordaunt Hall，*The New York Times*，1933

在这篇对 Spencer Tracy 主演的《*The Power and the Glory*》的评论中，制片人 Jesse L. Lasky 所称的 **narratage** 描述了一种由旁白推动故事、画面随之组接场景的手法。

九十年后，Narratage 让同一个理念有了新的形态：一门围绕旁白编译蒙太奇的语言与系统。

## 架构

AI 生成缓慢、昂贵且不确定。Narratage 把所需工作编译为一份持久化计划。

Core 极小且领域无关：它不认识视频。安装一个包即可增加能力，无需重新发布 Core。

| 层 | 负责什么 | 例子 |
|---|---|---|
| **Narratage Core** | 计划编译与 Build 状态机 | `core`、`protocol` |
| **Compiler** | Source 解析、导入与图展开 | `host`、`markup`、`svs`、`elaborator` |
| **Infrastructure** | 媒体处理、空间布局、字体与文本 | `media-pipeline`、`spatial`、`fonts-open` |
| **Video authoring** | 稿件、生成、语音、Track、Film 与渲染 | `script`、`seedance`、`caption`、`film` |
| **Providers** | 外部模型、程序与服务的适配器 | `provider-kie`、`provider-whisperx-local` |
| **Runtime** | 调度、存储、凭据与执行 | `runtime`、`store-sqlite`、`local` |
| **Applications** | 创作和操作 Narratage 的用户界面 | `cli`、`svml-playground` |

## 接下来去哪

- [演示](https://narratage.hypit.ai/zh/) —— 并排查看 SVML 源码与它渲染出的画面。
- [快速开始](https://narratage.hypit.ai/zh/quickstart) —— 写作、预览、规划并构建你的第一支视频。
- [开发](https://narratage.hypit.ai/zh/guide/develop) —— 理解包架构，并添加 Author 包或 Provider。

## 第三方软件

Narratage 集成了以下采用独立许可的软件：

- [FFmpeg](https://ffmpeg.org/) —— 以独立许可的可执行程序完成媒体探测、规范化、变换与封装。
- [HyperFrames](https://www.npmjs.com/package/hyperframes) —— 在 Chromium 中把 Composition 渲染为帧精确的视频。
- [WhisperX](https://github.com/m-bain/whisperX) —— 把口播中的每个词对齐到时间，用于语义定位。
- [Fontsource](https://fontsource.org/) —— 提供有版本的开放字体包，每款字体均附带自己的字体文件与许可证。

## 许可

Narratage 以 [Narratage 开源许可](./LICENSE) 发布，这是一份修改后的 Apache 2.0 许可。你可以自行部署，将它用于所在组织的工作——包括商业工作和客户项目——也可以为一个组织运营单租户部署。向第三方提供多租户或托管服务，以及商业再分发，均需要商业授权。只要不是为了商业利益向第三方供应，你可以按照同一许可 fork、修改并公开源码。Narratage 已呈现的品牌与版权信息必须保持完整。

你用 Narratage 产出的内容归你所有。通过第三方模型或服务生成的产物，还可能受到相应服务商条款的约束。

以英文 [`LICENSE`](./LICENSE) 文本为准。商业授权请联系 [official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry)。
