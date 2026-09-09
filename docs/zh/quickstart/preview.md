---
title: Hypit Studio
description: 浏览编排、Source 和 Result，编辑作品的时机与外观。
---

# Hypit Studio

Studio 在浏览器中打开可编辑的视频项目。你可以播放编排、逐帧查看，在时间线上选择词语或图形，并修改组件公开的属性。交付成片时，也可以一起打开 Studio，展示作品的可编辑结构。

## 打开要编辑的作品

```bash
cd /path/to/my-video
hypit-studio --run build.svrun
```

打开命令打印的网址。Studio 使用这份 Run 选择的 Author Source 和素材。编辑时要保留已生成素材，可以通过 [`build-record` 与 `satisfy`](./run.md) 选择已完成的 Output。

| 参数 | 用途 |
| --- | --- |
| `--run <file.svrun>` | 选择要打开的 Run。 |
| `--runtime <profile.json>` | 选择 Runtime Profile；省略时使用项目保存的 Runtime 选择。 |
| `--workspace <directory>` | 设置 Source 访问与修改的项目边界。 |
| `--port <number>` | 指定浏览器服务端口，默认请求 `5179`。 |

所选目标需要指向一个 Film 及其时间来源。说话表演可以提供 SemanticTrack，动画可以使用作者声明的 ProgramSpace，两者都支持视觉组件与属性编辑。显示编排所需的素材应已通过 Run 提供。Studio 可以完成所选 Runtime 支持的媒体准备；生成和编码渲染通过 `hypit build` 提交。

## 浏览项目

左侧资源库包含三个视图：

- **Source** 列出所选 Run 及其 Author、Recipe 文件，可以选择文件查看或编辑。
- **Tasks** 显示项目已完成的 Build；选择 Runtime 后，也能查看活动执行信息。
- **Artifacts** 用于查看 Build Result 中保留的公开产物文件。

选择 Artifact 会打开它供查看。要将它用于编排，修改 Run 的 Candidate 选择，让素材选择留在可编辑的项目中。

## 画面、时间线与 Inspector

中央 Preview 使用 HyperFrames 绘制编排，组件布局、素材采样和动作与编码渲染来自同一份编排。调整字幕位置、图形重点或覆盖画面时，可以对照真实素材查看。

Timeline 把组件的出现放在同一时钟上。语义编排还会显示 Segment、Word、Selection 和 Moment。选择实体即可定位；播放、逐帧、缩放和滚动便于查看具体转场或版面。

Inspector 显示所选实体的属性。可编辑字段与时间线手柄由组件的 **Studio Companion** 提供，它负责向 Studio 描述组件。项目组件可以随绘制代码一起提供自己的 Companion。组件能够渲染，与它开放了哪些编辑控件，是两件事：字段或手势需要明确可修改的 Source 值。

## 修改作品

Source 编辑修改所选 `.svml`、`.svs` 或 `.svrun` 文件。支持的 Inspector 修改和时间线手势会写回对应作者值，然后用同一份 Run 重新编译。移动共享的 Selection 或 Moment，会改变它在 Script 中的位置，使用它的组件随之更新；修改共享 Frame 或 Recipe，也可能影响多个画面元素。

编辑后查看保存状态。重新编译失败时，Studio 显示错误并恢复之前的文件。结构化 Inspector 草稿使用 Apply 或 Reset。Run 和已加载 Source 文件会被监听；更换安装包、组件代码或 Runtime 选择后，需要重启 Studio 来加载这些变化。

## 声音与交付

预览播放包含 Film 选中的 AudioTrack，例如口播、音乐与音效。导出视频的音频由渲染的媒体管线装配。交付编码后的成片，同时可以用 Studio 浏览其可编辑编排。

组件作者可以阅读 [Studio 时间谱系](../guide/studio-temporal-windows.md) 了解语义编辑，以及 [Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-adapter/README.md) 了解如何公开组件实体和控件。
