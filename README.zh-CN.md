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
  <a href="https://github.com/hypit-ai/narratage/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/hypit-ai/narratage?style=flat-square&color=6E40C9&logo=github&logoColor=white&label=Forks"></a>
  <a href="https://github.com/hypit-ai/narratage/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/hypit-ai/narratage?style=flat-square&color=2EA043&logo=github&logoColor=white"></a>
  <a href="./package.json"><img alt="Node 22+" src="https://img.shields.io/badge/node-22+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-yellow?style=flat-square"></a>
  <a href="https://github.com/hypit-ai/narratage/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hypit-ai/narratage/ci.yml?branch=main&style=flat-square&label=CI"></a>
</p>

<p align="center">
  <a href="https://narratage.hypit.ai/zh/"><img alt="Website" src="https://img.shields.io/badge/Website-narratage.hypit.ai-000000?style=flat-square&logo=googlechrome&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="X" src="https://img.shields.io/badge/Follow-%40hypitai-000000?style=flat-square&logo=x&logoColor=white"></a>
  <a href="https://t.me/narratage"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-Join%20Group-26A5E4?style=flat-square&logo=telegram&logoColor=white"></a>
</p>

Premiere、剪映、DaVinci、Final Cut——全是给人的手和眼睛造的，钉在时间轴上。Narratage 是一门给 AI Agent 设计的语言和编译器。用 SVML 写一个剧本，编译器把生成的视频、语音、字幕和特效装配成一支完整的 MP4。

- **没有时间线** —— 不钉在轨道的秒上，挂在叙事的词上。
- **Agent 原生** —— 输入是纯文本，任何 LLM 天生就能读、写、改。
- **可复现** —— 同样的剧本，同样的输出。编译前先看完整执行计划，确认了再花钱。

## 怎么工作的

1. **写剧本** —— 谁说什么话、画面放哪里。不含时间码，不含素材路径。
2. **生成** —— 调用视频和语音模型，生成每段口播画面。
3. **对齐** —— 语音识别测出每个词的精确时间，字幕和 B-roll 自动挂到词上，不是挂到秒上。
4. **渲染** —— 所有轨道合成一张画布，逐帧渲染，输出 MP4。

改剧本里一行字，重新编译——只有受影响的段落重新生成。已经生成过的结果可以显式复用，不重复花钱。

## 语言

SVML 是创作语言，Narratage 是围绕它的编译器、运行时与包生态。

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

### 用编程 Agent

把下面这段发给你的 Agent：

```text
安装并使用这个仓库里的 narratage skill。配置我的环境，只向我索取当前 Runtime Profile
实际需要的 API key，然后带我完成第一支 SVML 视频的创作与 Build。
```

### 从终端

需要 Node.js 22+ 与 pnpm 10.33.x：

```bash
git clone https://github.com/hypit-ai/narratage.git
cd narratage
corepack enable
pnpm install --frozen-lockfile

node --run narratage -- check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock

node --run narratage -- plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock
```

`check` 校验源码并打印类型化输出。`plan` 展示被真正需要的执行子图，以及一次真实 Build 会用到的每一项外部能力——但不会启动其中任何一项。

真实的 Build 还需要 `PATH` 上有 `ffmpeg` 与 `ffprobe`，以及视 Runtime Profile 而定的 Python 与 `uv` 或 API 凭据。运行 `narratage doctor` 查看缺什么；完整指南见[快速开始](https://narratage.hypit.ai/zh/quickstart)。

## 名字的由来

1933 年《*New York Times*》对电影《*The Power and the Glory*》的影评造出了 **narratage**：旁白加蒙太奇——声音推动故事前进，画面组接出与之呼应的段落。

这套系统做的正是这件事。作者写下口播剧本，编译器把生成的视频、字幕、B-roll、文字与音频装配成一部完整的影片。

## 架构

AI 生成慢、贵、不确定，而且每一步的输出往往就是下一步的输入。Narratage 把由此产生的选择呈现为两张平级的图：**Author Graph** 表达工作本身，**Run Graph** 为一次 Build 选择目标。Core 只负责解析、校验并推进状态机——视频领域的概念都留在可独立安装的包里，Core 不硬编码任何模型、Track 或 Provider。

三个文件各管一事：`.svml` 管*做什么视频*（剧本+样式+轨道），`.svrun` 管*这次要产出什么*（哪些目标、复用哪些旧结果），运行时配置管*在哪跑*（API key、并发、权限）。

## 接下来去哪

- [演示](https://narratage.hypit.ai/zh/) —— 悬停 Script 中的标记区间，旁边即刻显示它对应的画面。
- [快速开始](https://narratage.hypit.ai/zh/quickstart) —— 你掌控的文件、命令，以及第一次真实 Build。
- [开发](https://narratage.hypit.ai/zh/guide/develop) —— 包架构、添加 Author 包或 Provider。

## 第三方软件

Narratage 依赖一些它并不随附的工作。

- [FFmpeg](https://ffmpeg.org/) —— 媒体探测、规范化与封装。作为一个由你自行安装的独立程序被调用，遵循其自身许可。
- [HyperFrames](https://www.npmjs.com/package/hyperframes) —— 在无头 Chromium 中渲染 Composition。
- [WhisperX](https://github.com/m-bain/whisperX) —— 字幕时间轴背后的词级语音对齐。
- [Fontsource](https://fontsource.org/) —— 开放字体目录，以钉版包的形式交付，每个包自带各自的 SIL OFL 1.1 或 Apache 2.0 许可证与字体字节。Narratage 既不内置字体文件，也不读取系统字体。

## 许可

Narratage 以 [Narratage 开源许可](./LICENSE) 发布，基于 Apache 2.0 并附加额外条款。你可以在自己的基础设施上运行它，包括用于所在组织的商业工作；也可以 fork、修改并以相同条款公开源码。将 Narratage 作为多租户或托管服务运营，以及为商业利益向第三方提供它，都需要商业授权。你用 Narratage 产出的内容归你所有。

以英文 [`LICENSE`](./LICENSE) 文本为准。商业授权请联系 [official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry)。
