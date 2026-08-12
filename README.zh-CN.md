<p align="center">
  <img alt="Narratage" src="docs/public/narratage-logo.svg" width="420">
</p>

<p align="center"><em>“First, there was narration. Then, there were montages.”</em></p>

<p align="center">
  <a href="https://narratage.hypit.ai/zh/quickstart">快速开始</a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://narratage.hypit.ai/zh/guide/develop">开发</a>
  &nbsp;&nbsp;&nbsp;
  <a href="./README.md">English</a>
</p>

Narratage 是一套面向 AI 视频创作的语义化、图原生系统。你写下故事，选择模型与视觉组件，声明想要哪些
输出；Narratage 把这份意图变成一张有限的执行计划，只运行结果真正依赖的工作，并把每一个已接受的输出
保留下来，供后续 Run 使用。

SVML 是创作语言，Narratage 是围绕它的编译器、运行时与包生态。

Narratage 目前从源码仓库运行，npm 包与 CLI 尚未发布。

## 它写起来是什么样

Script 始终是可读的散文。Segment 组织故事，Role Cue 指明谁在说话，Dual Text 把观众看到的文字与说话者
念出的内容分开，Selection 与 Moment 为语义区间和时间点命名——全程不引入时间码。

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

这段 Script 展示了完整的标记词汇：

| 写法 | 含义 |
|---|---|
| `<opening>...</opening>` / `<pause/>` | 有台词的 Segment 与空 Segment |
| `<MARA>` | Role Cue，持续到下一个 Cue 或 Segment 结束 |
| `<2:13 A.M. \| two thirteen in the morning>` | 左侧为显示文字，右侧为念出的文字 |
| `< \| only>` | 只念不显示的口语衬词 |
| `@mystery ... @/mystery` | 边界向内吸收的 Selection |
| `~@proof ... @/proof~` | 边界向外吸收的 Selection |
| 重复的 `@beat ... @/beat` | 一个 Selection 的多次不连续出现 |
| `@flash!` / `~@cut!` | 附着在下一个词开头 / 上一个词结尾的 Moment |
| `\@midnight` | 字面量 `@midnight`，不是标记 |
| `<!-- ... -->` | 源码注释，不进入任何文字投影 |

`@whole` 跨越了 Segment 边界；`@claim` 与 `proof` 表明 Selection 可以交叉而非只能嵌套；`tagline`
说明 Segment 可以没有角色。重复同一个 Selection id 会产生多次不连续的出现。
标记名本身不带行为：`@silence` 不会让音频静音，必须由 Audio、Caption 或 Track 组件显式消费这个
Selection。完整的转义规则与 Slot 解析契约见 [Script](https://narratage.hypit.ai/zh/quickstart/script)。
面向作者的 `<script>` Surface 目前尚未暴露 Slot 绑定。

外层的组件行是刻意节选的，用来展示生成媒体、对齐与 Track 如何消费 Script 的投影。完整且可检查的源码
见 [`talking-film-graph-check`](./examples/talking-film-graph-check/main.svml)，其中包含 import、
布局、字幕、Film 与渲染。带命名空间的组件都来自包，Core 不硬编码 Seedance、WhisperX、Caption 或 Film。

## 不需要 API Key 也能试

需要 Node.js 22+ 与 pnpm 10.33.x。下面的命令会安装源码工作区，并在不启动任何 Provider、不产生任何
付费请求的前提下编译出一张完整的视频图：

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

`check` 校验 Author Source 并打印它的类型化输出。`plan` 展示被真正需要的子图，以及一次真实 Build 会
用到的每一项外部能力。Plan 阶段永远不会启动外部工作。

如果 Corepack 不可用，或者你想运行本地 media、WhisperX、OpenCV 或 HyperFrames，请看
[快速开始](https://narratage.hypit.ai/zh/quickstart)。

## 你掌控的文件

| 文件 | 用途 |
|---|---|
| `main.svml` | 这支视频：Script、所选模型、Track 与 Composition |
| `studio.svs` | 可选。由 Author Source 导入的可复用视觉与提示词 Recipe |
| `build.svrun` | 一次 Run 需要的输出，包括显式复用或替换的 Candidate |
| `svml.runtime.json` | 机器环境：Store、Endpoint、凭据与并发 |
| `svml.packages.lock` | 生成的 Author 与计算包 lock |
| `svml.runtime-packages.lock` | 生成的 Runtime 与 Provider 包 lock |

- SVML 表达作者的意图，并在模型族的选择会影响结果时显式作出选择。
- SVRUN 表达这次 Run 要产出什么，以及哪些既有结果可以满足这些输出。
- Runtime Profile 表达这些 Operation 在哪里执行。
- Provider 把精确的能力请求翻译成本地程序或远程 API，不会重新解释作者的创作选择。

## 从源码到成品

```text
main.svml + studio.svs
          │
          ▼
      Author Graph  ◀──── build.svrun 选择 Target 与 Candidate
          │
          ▼
     冻结的 BuildPlan    此时尚未启动任何外部工作
          │
          ▼
 Runtime Profile ─────── Worker、Store 与确切的 Provider Endpoint
          │
          ▼
 已接受的 Record ────── 可检查、可复用，或用 `get` 取出
```

不存在特权化的“最终视频”根节点。一次 Run 的 Target 可以是一张生成的图片、一份转写映射、一条 Track，
也可以是完成的成片。编译器从这些 Target 反向追溯依赖，不调度无关的工作。

## 跑一个真实项目

把视频项目放在 Narratage 仓库之外。源码开发阶段，从项目目录调用仓库里的轻量启动器：

```bash
cd /path/to/my-video

# 一次性配置，之后只在 import 或 Runtime 包选择变化后重复。
/path/to/narratage/narratage packages sync build.svrun \
  --runtime svml.runtime.json

# 看清这次 Run 选中的确切工作。
/path/to/narratage/narratage plan build.svrun \
  --runtime svml.runtime.json

/path/to/narratage/narratage build build.svrun \
  --runtime svml.runtime.json \
  --build-id my-video-001 \
  --follow

/path/to/narratage/narratage get my-video-001 \
  --runtime svml.runtime.json \
  --name final.video \
  --to output/final.mp4
```

`build` 提交持久化的工作，并确保选定的 Worker 可用。`--follow` 只是观察这次 Build，关闭观察端不会取消
它。用 `status`、`queue`、`operations` 与 `inspect` 查看正在发生什么。`check` 用于编辑源码，
`doctor` 用于配置和排查部署——它们都不是每次 Build 前必须重复的仪式。

第一次付费 Build 之前，请先读
[Run Source 与 Build](https://narratage.hypit.ai/zh/quickstart/run)，其中涵盖 Runtime Profile、
凭据、并发、取消，以及对既有输出的显式复用。

## 为什么用图语言

AI 生成慢、贵、易错，而且不确定；它的输出常常又是下一步的输入。线性脚本或隐藏的工作流执行器无法清楚
回答下面这些问题：

- 作者到底请求了什么？
- 此刻真正需要哪个结果？
- 由哪个实现、哪个 Provider 产出？
- 哪张既有图片或视频应当被有意复用？
- 什么可以并行，什么在等待上游结果？
- 最终被接受的输出究竟由什么产生？

Narratage 把这些选择呈现为两张平级的图：Author Graph 表达工作本身，Run Graph 为一次 Build 选择
Target 与实现。Core 只负责解析、校验并推进由此得到的状态机；视频领域的概念都留在可独立安装的包里。

规范性的最小法则见 [Core Kernel 规范](./spec/core-kernel.md)。

## 不改 Core 也能扩展

包可以各自独立地贡献：

- 面向作者的 Surface 及其图下降；
- 与其他包共享的类型化契约；
- 确定性的计算 Operation；
- 本地或远程的 Provider Endpoint；
- Scheduler、凭据 Store 或 Artifact Store 的实现。

Core 不维护视频模型、Track 或 Provider 的中央名单。已安装的包之间通过名义类型与显式的图边通信。

按你要做的事选择指南：

- [创作一支视频](https://narratage.hypit.ai/zh/quickstart)
- [理解包的边界](https://narratage.hypit.ai/zh/guide/packages)
- [添加一个 Author 包](https://narratage.hypit.ai/zh/guide/author-packages)
- [添加一个 Provider](https://narratage.hypit.ai/zh/guide/providers)
- [配置 Runtime Profile](https://narratage.hypit.ai/zh/guide/runtime-profile)
- [开发 Narratage 本身](https://narratage.hypit.ai/zh/guide/develop)

## 仓库结构

```text
packages/   Core、编译器、Runtime、视频包与 Provider 适配器
services/   WhisperX、OpenCV 等本地外部程序
examples/   可检查的源码与完整的 Runtime 示例
docs/       narratage.hypit.ai 文档站点的源码
spec/       规范性的协议与视频包契约
tools/      仓库检查与专用开发工具
```

## 开发

下面的命令用于修改 Narratage 本身，不是用来做视频的：

```bash
pnpm check
pnpm test
pnpm docs:build
```

## 许可

Narratage 以 [Narratage 开源许可](./LICENSE) 发布，基于 Apache 2.0 并附加额外条款。你可以在自己的
基础设施上运行它，包括用于所在组织的商业工作；也可以 fork、修改并以相同条款公开源码。将 Narratage
作为多租户或托管服务运营，以及为商业利益向第三方提供它，都需要商业授权。你用 Narratage 产出的内容
归你所有。

以英文 [`LICENSE`](./LICENSE) 文本为准。商业授权请联系
[official@hypit.ai](mailto:official@hypit.ai?subject=%5BGitHub%5DNarratage%20Commercial%20License%20Inquiry)。
