<p align="center">
  <img alt="Narratage" src="docs/public/narratage-logo.svg" width="420">
</p>

<p align="center"><em>“First, there was narration. Then, there were montages.”</em></p>

<p align="center">
  <a href="https://narratage.hypit.ai/zh/quickstart">快速开始</a>&nbsp;&nbsp;<a href="https://narratage.hypit.ai/zh/guide/develop">开发</a>&nbsp;&nbsp;<a href="./README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/hypit-ai/narratage/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hypit-ai/narratage/ci.yml?branch=main&label=CI"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0%20with%20conditions-blue.svg"></a>
  <a href="https://github.com/hypit-ai/narratage/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/narratage?style=flat"></a>
</p>

Narratage 是一套面向 AI 视频创作的语义化、图原生系统。你写下故事，选择模型与视觉组件，声明想要哪些输出；Narratage 把这份意图变成一张有限的执行计划，只运行结果真正依赖的工作，并把每一个已接受的输出保留下来，供后续 Run 使用。

SVML 是创作语言，Narratage 是围绕它的编译器、运行时与包生态。

## 名字的由来

1933 年《*New York Times*》对电影《*The Power and the Glory*》的一篇影评造出了 **narratage** 这个词，用来描述当时的一种新兴手法：旁白加蒙太奇——声音推动故事前进，画面组接出与之呼应的段落。

这套系统做的正是这件事。作者写下带有语义锚点的口播 Script，编译器把生成的视频、字幕、B-roll、文字与音频组装成一部完成的影片。

## 它写起来是什么样

Script 始终是可读的散文。Segment 组织故事，Role Cue 指明谁在说话，Dual Text 把观众看到的文字与说话者念出的内容分开，Selection 与 Moment 为语义区间和时间点命名——全程不引入时间码。

```xml
<script id="story">
  @whole

  <opening>
    <MARA> @mystery @beat At <2:13 A.M. | two thirteen in the morning>,
           every billboard in the city began telling the same story. @/beat @/mystery
  </opening>

  <reveal>
    <!-- The screens wake before the city does. -->
    @claim
    <NOAH> Whose story?
    <MARA> Mine. They spent ten years ~@proof cutting me out of @flash!
           every photograph. @/claim So I put myself back into all of them @/proof~.
    <NOAH> @beat You rewrote the whole city? @/beat
    <MARA> I < | only> changed one thing ~@cut!: the ending.
           I signed it \@midnight.
  </reveal>

  @silence
  <pause/>
  @/silence

  <tagline>
    By sunrise, the city remembered the woman history had erased.
  </tagline>

  @/whole~
</script>

<seedance:TextVideo id="take"
  model="mini"
  prompt={story.segment.opening.dialogue}
  duration="5"
  generate-audio="true"/>

<whisperx:Alignment id="timing"
  narrative={story}
  audio={speech.audio}/>

<media-track:Item
  video={motion.video}
  during={story.selection.proof}
  frame={card-frame}/>
```

上面这段 Script 里的每一个标记：

| 写法 | 含义 |
|---|---|
| `<opening>...</opening>` / `<pause/>` | 一个有台词的 Segment，和一个空的 |
| `<MARA>` | Role Cue，一直生效到下一个 Cue 或本 Segment 结束 |
| `<2:13 A.M. \| two thirteen in the morning>` | 左边显示，右边念出 |
| `< \| only>` | 只念，不进字幕 |
| `@mystery ... @/mystery` | Selection，恰好覆盖两个标记之间的词 |
| `~@proof ... @/proof~` | 同上，但两端各向外多吃掉相邻的一个词 |
| 重复的 `@beat ... @/beat` | 同一个 Selection 出现在多个位置 |
| `@flash!` / `~@cut!` | Moment，落在下一个词的词首／上一个词的词尾 |
| `\@midnight` | 字面量 `@midnight` |
| `<!-- ... -->` | 注释，不会进入任何输出文字 |

标记名本身不带行为：`@silence` 不会让音频静音，必须由 Audio、Caption 或 Track 组件显式消费这个Selection。完整词汇见 [Script](https://narratage.hypit.ai/zh/quickstart/script)；完整且可检查的源码见[`talking-film-graph-check`](./examples/talking-film-graph-check/main.svml)。

## 使用 Narratage skill

如果使用编程 Agent，把下面这段发给它：

```text
安装并使用这个仓库里的 narratage skill。配置我的环境，只向我索取当前 Runtime Profile
实际需要的 API key，然后带我完成第一支 SVML 视频的创作与 Build。
```

## 不需要 API Key 也能试

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

`check` 校验 Author Source 并打印它的类型化输出。`plan` 展示被真正需要的子图，以及一次真实 Build 会用到的每一项外部能力，但不会启动其中任何一项。

## 为什么用图

AI 生成慢、贵、不确定，而且每一步的输出往往就是下一步的输入。Narratage 把由此产生的选择呈现为两张平级的图：Author Graph 表达工作本身，Run Graph 为一次 Build 选择 Target 与 Candidate。Core 只负责解析、校验并推进由此得到的状态机，因此视频领域的概念都留在可独立安装的包里——Core 不硬编码任何模型、Track 或 Provider。

## 接下来去哪

- [快速开始](https://narratage.hypit.ai/zh/quickstart) —— 你掌控的文件、命令，以及第一次真实 Build。
- [开发](https://narratage.hypit.ai/zh/guide/develop) —— 包架构、添加 Author 包或 Provider。

## 许可

Narratage 以 [Narratage 开源许可](./LICENSE) 发布，基于 Apache 2.0 并附加额外条款。你可以在自己的基础设施上运行它，包括用于所在组织的商业工作；也可以 fork、修改并以相同条款公开源码。将 Narratage作为多租户或托管服务运营，以及为商业利益向第三方提供它，都需要商业授权。你用 Narratage 产出的内容归你所有。

以英文 [`LICENSE`](./LICENSE) 文本为准。商业授权请联系[official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry)。
