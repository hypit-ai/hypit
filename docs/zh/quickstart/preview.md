---
title: 实时预览
description: 把一个素材已经存在的 Run 当作可编辑的时间线来读。
---

# 实时预览

**Hypit Studio** 打开一个 Run，把它的 Film 或 Render target 回溯到自己能编辑的那些投影，然后画出来——右侧是代码，左上是画面，左下是时间线。除了 Author SVML 之外它不写入任何东西，也从不调用 Provider。

Studio 只构建它能从 Run 已经提供的 Candidate 确定性推导出来的东西，因此它需要一个素材已被满足的 Run——每一个生成 output 要么由一次已接受的 Build 产出，要么由一个文件顶上。你指向的就是这样一个 Run。

```bash
hypit-studio --run examples/all-components-preview/studio.svrun --workspace .
# ➜  http://localhost:5179/
```

::: warning 本仓库的示例需要先有素材
`examples/all-components-preview/studio.svrun` 可以直接打开：它显式提供了 Semantic Take 和字幕计划。其他示例 Run 仍可能指名需要 Provider 去做的镜头，或 `examples/**/assets/` 下未提交的素材。先在你自己的 Run 里满足它们，再打开。
:::

| 参数 | 含义 |
| --- | --- |
| `--run <build.svrun>` | 要打开的 Run Source。必填。Studio 会从它里面把 Author SVML 读回来。 |
| `--runtime <hypit.runtime.json>` | 早先 Build 产出的素材存放在哪里。只有通过 `<build-record>` 复用已接受镜头的 Run 才需要。 |
| `--workspace <directory>` | 默认为 Run 所在的目录。 |
| `--port <number>` | 默认 `5179`。 |

工作单元是 Run，不是 `.svml`。用什么去读一个 Source——哪些文件顶替哪些 output、复用哪些 Build 记录——是一项创作决策，而 Run Source 正是写下这项决策的地方。见 [Run Source 与 Build](./run)。

::: tip 启动新服务前先停掉上一个
第二个 Studio 会悄悄占用另一个端口，于是你一边读着过期的预览，一边描述着新的改动。先把旧的停掉：

```bash
pkill -f "hypit-studio" || true
```

确实想并排看两个 Run 时，再用 `--port`。
:::

## Studio 画什么

Studio 只构建 Run 的确定性闭包，除此之外什么都不做。打开 Studio 从不调用 Provider，也从不创建 Build，因此它画出的每一个投影，要么由 Run 作为 Candidate 提供，要么可以从这样一个 Candidate 确定性地推导出来。

**所有结构性的东西都是真的。** Placement Frame、padding、堆叠顺序、动效以及 Track 布局，都由构建时调用的同一批函数、从你的 Source 和 Recipe 算出。一张卡片如果在画面里的位置不对，在这里同样是不对的。

**每一处时序都是实测的。** 时间线来自 `SemanticTrack`——也就是已对齐的那些 Take 本身——所以你看到的剪切点就是构建产出的剪切点。

当闭包需要的某样东西缺失时，Studio 会说明并停下：

```
Studio cannot start:
- the Studio projection closure requires unresolved capabilities: seedance.video
```

它要求的是：

| 拒绝 | 含义 |
| --- | --- |
| `the Run Source has no target; Studio requires Film or Render` | Run 里没有任何东西指名一个可供回溯的成片。 |
| `the Run target is not a Film or Render output from the current SVML` | 指名的 target 在当前这份 Source 里并不存在。 |
| `Film has no traceable SemanticTake / Speech Track chain` | 没有语义骨架可以用来挂时间线。 |
| `the Studio projection closure requires unresolved capabilities: …` | 某条 Track 需要 Provider 才能存在。要么在 Run 里满足它，要么接受一次 Build。 |
| `Render target … is an opaque media Candidate; Studio needs the current Film graph` | Run 指向的是一个已经渲染好的视频文件。Studio 编辑的是图，不是产物。 |

第四条是你最常遇到的，而且它是全有或全无：闭包里任何一个未解决的 capability 都会拒绝整个 Run。一个节目是在某一步里整个变得可打开的——当它最后一个生成 output 被满足时。

## 提供你已经有的素材

```svml
<file id="take-1" type="@hypit/artifact@1#BlobArtifact"
  from="./assets/take-1.mp4" media-type="video/mp4"/>
<satisfy output="take-opening.video" candidate="take-1"/>
```

`<build-record>` 候选指名的是早先某次 Build 做出的东西而非一个路径，需要 `--runtime` 才能找到。

## 一条 Track 从哪来

选中一条 Track，会说明是哪个 Candidate 产出了它，以及它从哪里来——Run、Source，或者都不是。顶部对整个节目给出同样的判断：`timing: measured` 读自已对齐的 `SemanticTrack`，`picture: measured` 表示每个元素展示的都是真实素材。

## 当由 agent 来做这件事时

如果你正在通过 [Hypit skill](https://github.com/hypit-ai/hypit/blob/main/.agents/skills/hypit/SKILL.md)工作，那么每当某个步骤改动了 Source——改了 Script、移了 Frame、放了 B-roll、调了 Recipe——agent 会为你启动 Studio 并把链接发给你。

读 diff 和亲眼看见空镜落在哪里不是一回事，而此刻正是说出"那张卡片太靠上了"的最便宜的时机。

## 在里面移动

时间线、代码与画面是同一件事的三个视角，因此在任何一个里选中，另外两个都会跟着选中。点击一个片段，播放头会移到它的首帧，画面上会把它框出来，代码会滚动到安放它的那个标签。点击代码里被标记的行，或者画面上指针所指之处，效果相同。

Segment 包着 Selection，Selection 还能再包 Selection。每一层有自己的颜色——在源码、时间线和画面上保持一致——而且内层被框住时外层依然保持框住，因为嵌套关系正是这些标记存在的理由。播放头经过的每一个范围都会被框出来，不管有没有 Track 挂在它上面。

拖动标尺即可走带。`Space` 播放与暂停，`←` 和 `→` 步进一帧、按住 `Shift` 为十帧，`Home` 和 `End` 跳到首尾，`Esc` 清除选中。

## 语义泳道

Track 之上有一条并不是 Track 的泳道：`SemanticTrack` 本身，每个 Segment 画成一块。它是其余每一行赖以定位的骨架。

在整片视图下，Segment 就是有用的单位，所以它只画到这一层。放大之后，一旦某个 Segment 有了足够的宽度，它的词就会在它下方展开成一条真正的子泳道，就像一个 pattern 展开成钢琴卷帘那样。双击一个 Segment 可以缩放到它；工具栏上有显式的缩放控件，`Ctrl` + 滚轮可以捏合缩放。

点击一个词，播放头会移到那个词开始的帧——这是回答"这个空镜是不是落在正确的那句话上"最快的方式。

## 选择、投影与消费

时间线上的块不会被默认当成作者写下的 Selection。Studio 分开保留三个事实：具名的语义来源、组件对该来源的投影，以及组件最终消费的帧窗口。Selection 区间和 Moment 时点保留在语义泳道上；item 的投影线把该来源连到实际窗口。像 Ranking Column 这样含子调度的组件，会分开显示总窗口和各揭示阶段。

当前投影视图只读。它的数据契约与尚未确定的回写问题记录在 [Studio 时间窗口](../guide/studio-temporal-windows.md)。

## 声音

HyperFrames 刻意只渲染无声画面：programme audio 是一条独立的 Track，由 media pipeline 在最后 mux 进去。但把 B-roll 对着语音安放，前提就是能听见那句话，所以走带播放时 Speech Track 自己的素材允许发声。Cutaway 保持静音——除非显式声明要带音频，这和真实构建里的行为一致。喇叭按钮可以关掉。
