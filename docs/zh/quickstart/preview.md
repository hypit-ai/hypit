---
title: Studio 实时预览
description: 打开一份素材已经满足的 Run，检查画面、时间线并修改真实作者 Source。
---

# Studio 实时预览

Hypit Studio 打开一份 `.svrun`，把它的 Film 或 Render target 回溯到可解释的 Semantic 与 Track 投影，并用四个区域呈现：左上 Source、中上 Preview、右上 Inspector、下方 Timeline。

Studio 不提交生成，也不创建 Build。需要生成的素材必须由 Run 明确选择：可以是项目文件、由 `<build-record>` 引用的历史 Build Output，也可以是用 `satisfy` 选择的普通替身 Fragment。Studio 可以请求所选 Runtime Profile 执行 Provider 明确允许临时创作执行的媒体 Need，例如检查和归一化；它不根据价格猜权限、不替换 Candidate，也不暗中制造占位。其余 Need 会带着准确 capability 失败。

```bash
hypit-studio --run examples/all-components-preview/studio.svrun --workspace .
# ➜  http://localhost:5179/
```

| 参数 | 含义 |
| --- | --- |
| `--run <build.svrun>` | 要打开的 Run Source。必填。 |
| `--runtime <hypit.runtime.json>` | 用于临时媒体执行和显示活动 `BuildView`；历史 Result 与 `<build-record>` 仍来自项目 Result Repository。 |
| `--workspace <directory>` | Source 访问与写回边界；默认是 Run 所在目录。 |
| `--port <number>` | HTTP 端口，默认 `5179`。 |

Studio 的工作单元是 Run，不是孤立的 `.svml`。Run 决定当前 Author Source、目标和 Candidate；Studio 的每次重新编译都继续使用同一份 Run，不会在后台选择另一套素材。

## 什么样的 Run 可以打开

Studio 需要：

- 一个真实存在的 Film 或 Render target；
- 可以追溯的 Semantic Track 与可展示 Track；
- 明确选择的素材 Candidate；
- 能由确定性 Producer 和 Provider 声明的临时能力完成的显示闭包。

如果 Run 只提供一个不透明成片，或某条显示链仍要求外部生成，Studio 会拒绝启动。它编辑的是当前作者图和 Track，不从最终视频反推一份新工程。

项目文件可以直接满足一个输出；早先 Build 的结果可以通过 `<build-record>` 复用：

```svml
<file id="take-1" type="@hypit/artifact@1#BlobArtifact"
  from="./assets/take-1.mp4" media-type="video/mp4"/>
<satisfy output="take-opening.video" candidate="take-1"/>
```

## 四个区域

### Source

左上显示当前 Author SVML，支持行号、高亮、选择联动和文本编辑。当前版本还不是完整的 Source workspace；相关 SVS、SVRun、任务与产物浏览仍在单独调研。

### Preview

中上使用真实素材和 HyperFrames 画面。结构、Frame、padding、堆叠、动效和 Track 布局来自与 Build 相同的领域程序，不是 Studio 的近似重绘。

### Inspector

右上显示当前实体的来源、时间、操作能力和 adapter 公开的作者参数。可写字段都带精确 Source range；没有唯一写回目标的值保持只读。

### Timeline

下方把 Semantic Segment、Word、Selection、Moment 和组件 Track 放到同一帧域。点击实体会选择并 seek；可以播放、逐帧移动、缩放和滚动。只有 adapter 声明且能够解析到唯一作者目标的 move/trim 手势才会启用。

## 修改怎样落回 Source

Studio 有两类结构化作者操作：

- 时间线手势提交 `timeline.adjust`；
- Inspector 参数提交 `parameter.adjust`。

它们沿本次 Run 的真实执行谱系找到 SVML/SVS 中的作者逆像。修改后 Studio 使用同一 Run 重新编译；成功才发布新画面，失败就恢复文件并显示真实领域错误。它不会创建隐藏 Build、提交生成，或把 Selection 偷换成绝对帧。

选择、投影、消费与写回的完整语义见 [Studio 时间谱系](../guide/studio-temporal-windows.md) 和 [Studio 作者操作](../guide/studio-timeline-operations.md)。

## 声音

HyperFrames 只负责画面；Programme audio 最终由媒体管线装配。为了按口播检查 B-roll 时机，Studio 播放时可以同步播放 Speech Track 的真实音频。没有显式音频的视觉素材不会被自动赋予声音。
