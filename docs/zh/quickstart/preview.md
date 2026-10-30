---
title: Hypit Studio
description: 浏览编排、Source 和 Result，编辑作品的时机与外观。
---

Studio 在浏览器中打开可编辑的视频项目。你可以播放编排、逐帧查看，在时间线上选择词语或图形，并修改组件公开的属性。切换到 **Comments** 可以用更大的画面查看作品、按时间留下反馈。两个视图都可以在导出之前使用。

## 打开要编辑的作品

```bash
cd /path/to/my-video
hypit studio --source main.svml --target final.video
```

打开命令打印的网址。Source 与可重复的 `--target` 选项一起确定这个 Studio Session。编辑时要保留已生成素材，先把接受的
Output 导出到项目，再按[复用已经产出的内容](./run.md#复用已经产出的内容)在 Author Source 中记录长期选择。

**Studio / Comments 左侧的地球菜单**可以切换界面语言，内置英文和简体中文。首次访问跟随浏览器语言，之后记住你的选择。切换时保留播放位置、选中状态和评论草稿；稿子、视频字幕和评论内容保持原样。

| 参数 | 用途 |
| --- | --- |
| `--source <file.svml>` | 选择 Author Source；用一个或多个 `--target <output>` 声明本次 Session。 |
| `--runtime <profile.json>` | 选择 Runtime Profile；省略时使用项目保存的 Runtime 选择。 |
| `--project <directory>` | 设置 Source 访问与修改的项目边界。 |
| `--port <number>` | 指定浏览器服务端口，默认请求 `5179`。 |

所选目标需要指向一个 Film 及其 Timeline。准备媒体可以提供 Timeline Extent；当作品消费语义位置时，可选投影再发布对应的 Script 锚点。纯动画同样使用 Timeline，只需声明结束时间，不需要表演媒体。两者都支持视觉组件与属性编辑。显示编排所需的素材应已成为 Author Source 中的项目资源和作者选择。Studio 可以完成所选 Runtime 支持的媒体准备；生成和编码渲染通过 `hypit build` 提交。

## 在 Comments 一起看作品

打开命令打印的、以 `#comments` 结尾的网址，可以在画面旁看到评论区。点击画面播放或暂停，在选定时间留下意见；点击已保存的评论即可回到对应帧。评论按时间排列，编号按留言顺序显示。

评论保存在项目的 `FEEDBACK.json` 中，你和 Agent 都可以读取、修改、标记完成。发送评论会保存意见；写好后告诉 Agent 开始处理即可。切换到 **Studio** 则可以查看时间线、Source、Result，以及组件公开的控件。打开两个视图都不会编码视频，也不会提交导出 Build。

## 浏览项目

左侧资源库包含三个视图：

- **Source** 列出精确的 Author closure，可以选择文件查看或编辑。
- **Tasks** 显示项目已完成的 Build；选择 Runtime 后，也能查看活动执行信息。
- **Artifacts** 用于查看 Build Result 中保留的公开产物文件。

选择 Artifact 会打开它供查看。要将它用于编排，应导出到项目，在 Author Source 中声明，并更新消费它的引用。

## 画面、时间线与 Inspector

中央 Preview 求值编排生成的 HTML Programme；组件布局、素材采样和动作与编码成片来自同一份编排。调整字幕位置、图形重点或覆盖画面时，可以对照真实素材查看。

Timeline 把组件的出现放在同一时钟上。领域投影还可以贡献映射行与证据行，已解析的具名 Instant 共享一条定位行，Window 区间由消费它的 Track Item 展示。选择 Item 即可定位；播放、逐帧、缩放和滚动便于查看具体转场或版面。

Inspector 显示所选 Item 的属性。可编辑字段与时间线手柄由组件的 **Studio Companion** 提供，它负责向 Studio 描述组件。项目组件可以随绘制代码一起提供自己的 Companion。组件能够渲染，与它开放了哪些编辑控件，是两件事：字段或手势需要明确可修改的 Source 值。

## 修改作品

Source 编辑修改所选 `.svml` 或 `.svs` 文件。支持的 Inspector 修改和时间线手势会写回对应作者值，然后用同一组 Target 重新编译。移动共享的 Selection 或 Moment，会改变它在 Script 中的位置，使用它的组件随之更新；修改共享 Frame 或 Recipe，也可能影响多个画面元素。

编辑后查看保存状态。重新编译失败时，Studio 显示错误并恢复之前的文件。列表与记录控件在结束编辑时保存完整、有效的值；未填写完整时会显示提示。已加载 Author Source 会被监听；更换安装包、组件代码或 Runtime 选择后，需要重启 Studio 来加载这些变化。

## 声音与交付

预览播放包含 Film 选中的 AudioTrack，例如口播、音乐与音效。导出视频的音频由渲染的媒体管线装配。作品准备好交付后，运行导出 Build 得到编码后的成片；Studio 与 Comments 仍可用于查看可编辑作品、沟通后续修改。

组件作者可以阅读 [Studio 中的时间编辑](../guide/studio-temporal-windows.md) 了解时间关系编辑，以及 [Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-companion/README.md) 了解如何公开组件 Item 和控件。

需要其他界面语言时，可以通过 `--locale-pack ./language.json` 加载本地 JSON 译文。[本地化指南](https://github.com/hypit-ai/hypit/blob/main/packages/studio/LOCALIZATION.md) 介绍译文格式、缺项检查和语言包分享方法。
