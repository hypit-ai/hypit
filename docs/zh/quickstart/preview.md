---
title: 实时预览
description: 在任何素材生成之前，把 Source 当作时间线来读。
---

# 实时预览

到这里为止的一切都还是声明式的：一段 Script、若干 Recipe、一个生成镜头的请求。它们都还没有产出任何画面，而一次 Seedance 生成既花钱又花时间。

**SVML Playground** 直接读取 Source 并把它画出来——右侧是代码，左上是画面，左下是时间线。它从不写入任何东西，也从不调用 Provider。

```bash
pnpm svml:playground -- --source examples/all-components-preview/main.svml
# ➜  http://localhost:5179/
```

| 参数 | 含义 |
| --- | --- |
| `--source <main.svml>` | 要读取的 Author Source。必填。 |
| `--run <build.svrun>` | 一个 Run Source，从中读取它已经指名的素材与时序。 |
| `--runtime <svml.runtime.json>` | 早先 Build 产出的素材存放在哪里。只有通过 `<build-record>` 复用已接受镜头的 Source 才需要。 |
| `--port <number>` | 默认 `5179`。 |

两个可选参数是叠加的。两个都不给时，Playground 依然能在一个只有 `main.svml` 和 `.svs` 样式表的目录上运行——不需要包锁、不需要 Runtime Profile、不需要任何构建。

::: tip 启动新服务前先停掉上一个
第二个 Playground 会悄悄占用另一个端口，于是你一边读着过期的预览，一边描述着新的改动。先把旧的停掉：

```bash
pkill -f svml-playground || true
```

确实想并排看两个 Source 时，再用 `--port`。
:::

## 为什么它能画出还没人做出来的视频

一条 Track 离开它所安放的素材就无法构建。但如果非要等到每个镜头都存在才肯画，预览恰好会在它最该派上用场的那个阶段变得毫无用处。所以 Playground 把**已知**的和**假设**的分开，并明确告诉你哪个是哪个。

**所有结构性的东西都是真的。** Placement Frame、padding、堆叠顺序、动效以及 Track 布局，都由构建时调用的同一批函数、从你的 Source 和样式表算出。一张卡片如果在画面里的位置不对，在这里同样是不对的。

**时序是估算的**，直到某次构建对真实音频做过对齐为止。词的时长来自 `@narratage/estimate`——正是流水线在生成之前使用的那套音节模型。估算出的时间线是一种比例，而不是一个预言：等 WhisperX 对齐了真实音频，实际的剪切点会移动。

**缺失的素材会有替身**，而且每个替身都会被明确标注，不会被当作事实呈现：

| 缺失的 | 代之以 |
| --- | --- |
| 一个指名了参考图片的生成镜头 | 那张图片，按镜头声明的时长持续 |
| 一个什么都没指名的生成镜头 | 一帧符合节目画幅的黑场 |
| 无人规划过的字幕分句 | 按 Program 自己的 run，每隔几个 Atom 切一次 |

第一行正是值得你尽早打开它的理由。看[媒体与生成](./generation)里的这条链路：

```svml
<gpt:Image id="presenter" prompt={look} aspect-ratio="9:16" resolution="2K"/>

<seedance:ReferenceVideo id="take-opening" model="mini" prompt={direction} duration="8">
  <seedance:Reference image={presenter.image}/>
</seedance:ReferenceVideo>
```

在 Seedance 跑起来之前，`take-opening.video` 并不存在。但 Source 说清楚了它将由什么做成——`presenter.image`——以及它会持续多久：`duration="8"`。于是 Playground 就把那张参考图画出来，持续八秒，放在这个镜头所在的 Frame 里。

那不是最终的镜头。但它是**正确的主体、正确的画幅、正确的时长**，这已经足以回答构图对不对、以及这个空镜是否落在语音需要它的位置上——**在**这张图片流入视频生成之前，也在你为一个剪切点其实不对的镜头付钱之前。

凡是存在声明时长的地方都会被遵守。没有声明的地方，词按正常语速安放，剩余时间平均分配。

这对 Source 产出的每一条 Track 都成立，无论它出自哪个包。Playground 向编译后的 Source 索要它的 export，并构建其中类型为 `VisualTrack` 或 `AudioTrack` 的那些——因此某个包新长出一种 Track 时，它会直接出现在这里，不需要 Playground 事先认识它。

绘制替身需要 `PATH` 上有 `ffmpeg`。没有它，这些镜头就保持未绘制状态、Track 会如实说明，而不是假装它们已经画好了。

## 读懂徽章

顶部有两个彼此独立的判断，因为它们回答的是不同的问题：

| 徽章 | 含义 |
| --- | --- |
| `timing: measured` | 读自一次已完成构建的对齐转录。 |
| `timing: estimated` | 由 Script 文本按正常语速推导。 |
| `picture: measured` | 每个元素展示的都是真实素材。 |
| `picture: estimated` | 有镜头尚未做出来，正由替身顶替。 |

一个 Source 完全可能素材齐备、时间线却仍是估算的：剪切点落在哪里是关于语音的问题，不是关于文件的问题。在时间线上，每条 Track 会标明自己是 `made`、是 `stand-in`、还是黑场；选中某个片段则会完整说明原因。

## 提供你已经有的素材

随着素材逐渐积累，同一个预览会越来越接近真实，而 `main.svml` 一个字都不用改。用什么去读一个 Source 是一项创作决策，因此它写在 Run Source 里——见 [Run Source 与构建](./run)：

```svml
<file id="take-1" type="@narratage/artifact@1#BlobArtifact"
  from="./assets/take-1.mp4" media-type="video/mp4"/>
<satisfy output="take-opening.video" candidate="take-1"/>
```

用 `--run` 指向它，那个镜头就不再是替身。`<build-record>` 候选指名的是早先某次 Build 做出的东西而非一个路径，需要 `--runtime` 才能找到；没有 `--runtime` 时，**只有那一个**镜头会被指名拒绝，其余一切照常绘制。

## 当由 agent 来做这件事时

如果你正在通过 [Narratage skill](https://github.com/hypit-ai/narratage/blob/main/.agents/skills/narratage/SKILL.md)工作，那么每当某个步骤改动了 Source——改了 Script、移了 Frame、放了 B-roll、调了 Recipe——agent 会为你启动 Playground 并把链接发给你。

读 diff 和亲眼看见空镜落在哪里不是一回事，而此刻正是说出"那张卡片太靠上了"的最便宜的时机——在任何一个 Provider 跑起来之前。

## 在里面移动

时间线、代码与画面是同一件事的三个视角，因此在任何一个里选中，另外两个都会跟着选中。点击一个片段，播放头会移到它的首帧，画面上会把它框出来，代码会滚动到安放它的那个标签。点击代码里被标记的行，或者画面上指针所指之处，效果相同。

Segment 包着 Selection，Selection 还能再包 Selection。每一层有自己的颜色——在源码、时间线和画面上保持一致——而且内层被框住时外层依然保持框住，因为嵌套关系正是这些标记存在的理由。播放头经过的每一个范围都会被框出来，不管有没有 Track 挂在它上面。

拖动标尺即可走带。`Space` 播放与暂停，`←` 和 `→` 步进一帧、按住 `Shift` 为十帧，`Home` 和 `End` 跳到首尾，`Esc` 清除选中。

## 声音

HyperFrames 刻意只渲染无声画面：programme audio 是一条独立的 Track，由 media pipeline 在最后 mux 进去。但把 B-roll 对着语音安放，前提就是能听见那句话，所以走带播放时 Speech Spine 自己的素材允许发声。Cutaway 保持静音——除非显式声明要带音频，这和真实构建里的行为一致。喇叭按钮可以关掉。
