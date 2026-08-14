# SVML Playground

单个 Source 的只读预览：右边是代码，左上是画面，左下是直接从 SVML 渲染出的时间轴。

```bash
pnpm svml:playground -- --source examples/talking-film-broll-preview/main.svml
# ➜  http://localhost:5179/
```

| 参数 | 含义 |
| --- | --- |
| `--source <main.svml>` | 要读取的 Author Source，必填。 |
| `--run <build.svrun>` | Run Source，用来读取其中已经指名的素材与时间戳。 |
| `--runtime <svml.runtime.json>` | 早先构建产出的素材存放在哪里。只有复用已验收镜头的 Source 才需要。 |
| `--port <number>` | 默认 `5179`。 |

Playground 从不写入。它没有任何可以改动你所写内容的路由，也没有编辑 Recipe 的表单
—— 那是[字幕 Playground](./caption-playground) 的职责。

## 它解决什么问题

**在任何东西被生成之前**，把 Source 当成时间轴来读。不需要 Seedance 生成、不需要
WhisperX 对齐、不需要 FFmpeg 渲染、不需要无头浏览器，就能回答「这条 B-roll 落在哪、
多长、卡片在画面里的位置对不对」。

一个只装着 `main.svml` 和它的 `.svs` 样式表的目录就能跑。不需要 package lock、
不需要 Runtime Profile、不需要构建。

## 通往同一个选中的三条路

时间轴、源码和画面是同一件事的三种视图，在任何一处选中，三处同时选中。

- **点时间轴的片段**：播放头移到它的第一帧，画面上把它框出来，源码滚动到放置它的
  那个 `<media-track:Item>`。
- **点源码里被标记的行**：结果相同。绑定了片段的行在行号旁有一条彩色竖条，所以哪里
  可点是静止可见的，不用靠鼠标扫过去发现。一对 Script 标记和它绑定的片段共用一个颜色。
- **点画面**：指针下面画的是什么就选中什么。

点击被标记的散文会落在**你点的那个标记里面**，而不是被甩到包着它的那一层的开头 ——
一个什么都不放置的标记依然有含义。

拖动标尺或轨道空白处可以 scrub。`空格` 播放/暂停，`←` `→` 逐帧（配合 `Shift` 为十
帧），`Home` / `End` 跳到首尾，`Esc` 取消选中。

## 层级

Segment 包着 Selection，Selection 还能再包 Selection。**每一层有自己的颜色**，在源码、
时间轴和画面上一致；而且**内层被框住时外层保持框住** —— 嵌套关系正是这些标记存在的
理由。同一层的两个范围是同一种东西，读起来也相同。

播放头经过的每一个范围都会被框出来，不管有没有轨道挂在它上面。

## 声音

HyperFrames **刻意只渲染无声画面**：programme audio 是独立的 Track，由 media pipeline
在最后 mux 进去。但预览不是渲染 —— 检查 B-roll 落点的前提就是能听见那句话，所以播放时
Speech Spine 自己的素材允许发声。Cutaway 保持静音，这和真实构建里的行为一致（除非显式
声明要带音频）。喇叭按钮可以关掉。

## 哪些是真实的，哪些是估算的

结构性的一切都是真实的。Placement Frame、padding、层叠顺序、动效和轨道布局，都由构建
所调用的同一批函数、从你的 Source 和样式表算出。

时间则是另一回事，顶栏的徽章会说明你正在看的是哪一种：

| 徽章 | 含义 |
| --- | --- |
| `timing: measured` | 读自已完成构建的对齐转写。 |
| `timing: estimated` | 按常速语速从 Script 文本推导。 |
| `picture: measured` | 每个元素都显示真实素材。 |
| `picture: estimated` | 有些镜头还没做出来，用替身顶着。 |
| `picture: estimated` | 尚无任何拍摄或生成产物。 |

两者是**独立的判断**。一份 Source 可以素材齐备而时间轴仍是估算的 —— 剪切点落在哪里
是关于语音的问题，不是关于文件的问题。

Playground 按以下顺序优先采用真实来源：

1. **Run Source。** 用哪些素材、哪份时间戳是**作者的决定**，所以由 `<satisfy>` 指定：

   | 候选 | 提供什么 |
   | --- | --- |
   | `<file from="./shot.mp4" media-type="video/mp4"/>` | 你手上已有的素材。 |
   | `<value type="…" from="./timing.json"/>` | 磁盘上的一个值，例如别处产出的对齐结果。 |
   | `<build-record build="…" output="take.video"/>` | 上一次构建做出来的东西。需要 `--runtime`。 |

   只有 `timing.map` 和 Program Space **两者都被提供**时才算实测；只给其中一个仍然
   是估算，并且会照实说。

2. **上一次构建。** 已经生成并验收的镜头，是按**它出自哪次构建**来指名的，不是按路径
   —— 产出物有身份，没有位置。给了 `--runtime`，Playground 就去读那次构建的记录和它
   背后的 Artifact 字节，于是昨天生成的镜头就是今天屏幕上的镜头。不给的话，Run Source
   照读，只有那条 build record 被拒绝，并说明是哪一次构建。

3. **Script 文本。** 词的时长来自 `@narratage/estimate`，也就是流水线在生成之前使用的
   同一套音节模型。**凡是 Source 已经声明了时长的地方，以声明为准** —— 一段 take 说自己
   是 8 秒，它的词就铺满这 8 秒，音节模型只提供词与词之间的比例。

估算出的时间轴是**比例，不是预测**：真实的剪切点会在 WhisperX 对齐真实音频之后移动。

## 没做出来的东西用什么顶上

一条 Track 没有素材就建不出来，而"所有镜头都拍完之前什么都不画"会让预览在它最该派上
用场的阶段毫无用处。所以有三种顶替，每一种都写明，不会被说成是成品：

| 缺什么 | 顶上的东西 |
| --- | --- |
| 一个引用了图片的生成镜头 | 那张图，按镜头声明的时长撑开 |
| 一个什么都没引用的生成镜头 | 与节目同尺寸的黑场 |
| 没人规划过的字幕分句 | 按 Program 自己的 run，每几个 Atom 切一屏 |

第一种正是"还没生成就值得预览"的原因：参考图不是成片，但主体对、画幅对。两种顶替都
标在片段本身上，选中时会写明是哪一种。画它们需要 `ffmpeg`；没有的话镜头就保持未做，
轨道会照实说。

## 它画哪些东西

这份 Source 产出的每一条 Track，无论出自哪个包。Playground 向编译结果要它的导出，
把类型是 `VisualTrack` 或 `AudioTrack` 的那些建出来 —— 所以某个包新长出一种 Track，
不需要教 Playground 就会出现在这里。

这个应用显式携带 Narratage 的官方视频包清单。清单只属于 Playground：安装或卸载它，
都不会改变编译与 Runtime。新增一个官方包时需要同步发布 Playground；已携带的包新增
Track 时，不需要再为预览写一条特殊分支。

每条 Track 各自构建。某条轨道在等一个这台机器没有密钥的 Provider，代价只有它自己：
其余部分照常播放，而那条轨道会说明它在等什么，而不是凭空消失。

这是编译器本身，不是对它的一种解读。Source 由 `compileSourceClosure` 编译，由构建时
同一批 Producer 执行，所以**构建不出来的 Source 不会悄悄预览成功**。两个很薄的装饰器
留住了编译器丢弃的源码位置，除此之外没有任何东西被重新实现。

## 关于 `<space:Frame>` 的一点说明

`right` 和 `bottom` 是**绝对边位置**，不是内缩量。占据父级中间 80% 的 Frame 写作
`left="8%" right="92%"`，而不是 `left="8%" right="8%"` —— 后者解出的宽度为零，会被
拒绝。Playground 会报出这一点，并高亮出错的元素。
