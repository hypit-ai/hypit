---
title: 实时预览
description: 把一个素材已经存在的 Run 当作可编辑的时间线来读。
---

# 实时预览

**Hypit Studio** 打开一个 Run，把它的 Film 或 Render target 回溯到自己能编辑的那些投影，然后画出来——右侧是代码，左上是画面，左下是时间线。除了 Author SVML 之外它不写入任何东西，也从不调用 Provider。

最后这半句值得读两遍。Studio 只构建它能从 Run 已经提供的 Candidate 确定性推导出来的东西，因此**一份仍然声明着未生成镜头的 Source 是打不开的**。Studio 是你检视并调整一个素材已经存在的节目的地方；它不是一个在素材出现之前先看看它的办法。

```bash
pnpm studio -- --run path/to/build.svrun
# ➜  http://localhost:5179/
```

::: warning 本仓库当前没有任何示例能打开
`examples/` 下的每一个 Run Source，要么处于生成之前——它的镜头仍然需要 Seedance、GPT Image、WhisperX 或字幕规划——要么依赖 `examples/**/assets/` 下的素材，而那些素材并未提交。这两种情况都会被拒绝。请把 Studio 指向你自己的、output 已被满足的 Run。
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
pkill -f "@hypit/studio" || true
```

确实想并排看两个 Run 时，再用 `--port`。
:::

## Studio 会做什么，不会做什么

Studio 只构建 Run 的确定性闭包，除此之外什么都不做。打开 Studio 从不调用 Provider，也从不创建 Build，因此它画出的每一个投影，要么由 Run 作为 Candidate 提供，要么可以从这样一个 Candidate 确定性地推导出来。

**所有结构性的东西都是真的。** Placement Frame、padding、堆叠顺序、动效以及 Track 布局，都由构建时调用的同一批函数、从你的 Source 和 Recipe 算出。一张卡片如果在画面里的位置不对，在这里同样是不对的。

**时序永远是实测的。** 时间线来自 `SemanticTrack`——也就是已对齐的那些 Take 本身——所以你看到的剪切点就是构建产出的剪切点。这里没有估算模式。

**没有任何东西会有替身。** Studio 没有占位图片、没有黑场、也不会伪造时序。这是这笔交易里刻意的那一半：与其画出一个自己无法交代的东西再给它贴个标签，Studio 宁可拒绝打开，并说清楚缺的是什么。

```
Studio cannot start:
- the Studio projection closure requires unresolved capabilities: seedance.video
```

你比较可能遇到的几种拒绝：

| 拒绝 | 含义 |
| --- | --- |
| `the Run Source has no target; Studio requires Film or Render` | Run 里没有任何东西指名一个可供回溯的成片。 |
| `the Run target is not a Film or Render output from the current SVML` | 指名的 target 在当前这份 Source 里并不存在。 |
| `Film has no traceable SemanticTake / Speech Track chain` | 没有语义骨架可以用来挂时间线。 |
| `the Studio projection closure requires unresolved capabilities: …` | 某条 Track 需要 Provider 才能存在。要么在 Run 里满足它，要么接受一次 Build。 |
| `Render target … is an opaque media Candidate; Studio needs the current Film graph` | Run 指向的是一个已经渲染好的视频文件。Studio 编辑的是图，不是产物。 |

第四条是你最常遇到的，而且它是全有或全无：闭包里任何一个未解决的 capability 都会拒绝整个 Run，而不是让那一条 Track 单独变黑。所以一个节目是在某一步里整个变得可打开的——当它最后一个生成 output 被满足时——而不是逐步变得可打开。

## 提供你已经有的素材

```svml
<file id="take-1" type="@hypit/artifact@1#BlobArtifact"
  from="./assets/take-1.mp4" media-type="video/mp4"/>
<satisfy output="take-opening.video" candidate="take-1"/>
```

`<build-record>` 候选指名的是早先某次 Build 做出的东西而非一个路径，需要 `--runtime` 才能找到。

## 读懂徽章

顶部有两个判断；在一个能被打开的 Run 上它们都是 `measured`——能打开本身就意味着如此。它们仍然留在界面里，是因为它们说明了自己代表的是什么：

| 徽章 | 含义 |
| --- | --- |
| `timing: measured` | 读自已对齐的 `SemanticTrack`。 |
| `picture: measured` | 每个元素展示的都是真实素材。 |

选中一条 Track，会说明是哪个 Candidate 产出了它，以及它从哪里来——Run、Source，或者都不是。

## 当由 agent 来做这件事时

如果你正在通过 [Hypit skill](https://github.com/hypit-ai/hypit/blob/main/.agents/skills/hypit/SKILL.md)工作，那么当某个步骤改动了 Source——改了 Script、移了 Frame、放了 B-roll、调了 Recipe——只要它所针对的那个 Run 本身能打开，agent 就会为你启动 Studio 并把链接发给你。

读 diff 和亲眼看见空镜落在哪里不是一回事。在一个素材已经存在的 Run 上，此刻正是说出"那张卡片太靠上了"的最便宜的时机；而在一个镜头仍然只是被声明的 Run 上，agent 没有任何东西可以给你看，它会如实说明，而不是发一个链接过来。

## 在里面移动

时间线、代码与画面是同一件事的三个视角，因此在任何一个里选中，另外两个都会跟着选中。点击一个片段，播放头会移到它的首帧，画面上会把它框出来，代码会滚动到安放它的那个标签。点击代码里被标记的行，或者画面上指针所指之处，效果相同。

Segment 包着 Selection，Selection 还能再包 Selection。每一层有自己的颜色——在源码、时间线和画面上保持一致——而且内层被框住时外层依然保持框住，因为嵌套关系正是这些标记存在的理由。播放头经过的每一个范围都会被框出来，不管有没有 Track 挂在它上面。

拖动标尺即可走带。`Space` 播放与暂停，`←` 和 `→` 步进一帧、按住 `Shift` 为十帧，`Home` 和 `End` 跳到首尾，`Esc` 清除选中。

## 语义泳道

Track 之上有一条并不是 Track 的泳道：`SemanticTrack` 本身，每个 Segment 画成一块。它是其余每一行赖以定位的骨架。

在整片视图下，Segment 就是有用的单位，所以它只画到这一层。放大之后，一旦某个 Segment 有了足够的宽度，它的词就会在它下方展开成一条真正的子泳道，就像一个 pattern 展开成钢琴卷帘那样。双击一个 Segment 可以缩放到它；工具栏上有显式的缩放控件，`Ctrl` + 滚轮可以捏合缩放。

点击一个词，播放头会移到那个词开始的帧——这是回答"这个空镜是不是落在正确的那句话上"最快的方式。

## 声音

HyperFrames 刻意只渲染无声画面：programme audio 是一条独立的 Track，由 media pipeline 在最后 mux 进去。但把 B-roll 对着语音安放，前提就是能听见那句话，所以走带播放时 Speech Track 自己的素材允许发声。Cutaway 保持静音——除非显式声明要带音频，这和真实构建里的行为一致。喇叭按钮可以关掉。
