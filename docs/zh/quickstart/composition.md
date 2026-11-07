---
title: 导出 NLE 节目
description: 解析文件与包，经过 AVIR lowering，再渲染画面和音频。
---

可编辑 NLE 工程有意不兼任渲染器文档。预览和导出从一个不可变快照派生终端程序：

```text
hypit.nle@1 工程
  -> AVIR programme
       -> HTML picture programme -> Chromium frames
       -> audio programme        -> rendered audio
  -> muxed MP4
```

AVIR 是中间关系层：它携带事实 occurrence、精确时空映射、绘制顺序、音频混合与包拥有的
operator，但没有编辑轨道、undo 历史、DOM 或输出帧率。HTML 与音频适配器消费同一份已解析节目。

## 本地文件导出

当工程已经引用本地 Media Asset 文件，所需组件/特效包也已安装时，直接使用 NLE 命令：

```bash
hypit nle export edit.nle.json --to output.mp4
hypit nle export edit.nle.json --to output.mp4 --frame-rate 30000/1001
```

命令验证快照，只加载实例点名的包，解析主媒体文件，lower 画面与音频，完成渲染后发布 MP4，
且不会覆盖已有输出。

`--frame-rate` 只选择本次交付的画面采样，不修改工程中的精确时间。省略时，`editRate` 只是一个
方便的默认选择。

这条命令不是 AIGC Build，不创建 Runtime Profile、Result 历史、语义依赖或持久 prepare 状态。
生成媒体只有在导出为文件、由 Media Asset 文档描述并通过普通物化编辑插入 NLE 后，才成为工程
素材；相机拍摄和下载文件也走同一入口。

## 什么仍然可编辑

导出后 `.nle.json` 仍是权威。AVIR、HTML、音频和渲染中间物都是派生值，无需回写。之后一次
trim 或参数修改产生新的工程 revision；下一次预览或导出 lower 这个新快照。

继续阅读 [NLE 工程结构](./tracks.md)了解媒体、Item 和包实例，或
[精确时间](./timing.md)了解帧率无关性。
