---
title: NLE 工程结构
description: 平面工程文件中的媒体、组件、特效与编辑关系。
---

可编辑的 Hypit 节目是一份标记为 `hypit.nle@1` 的严格 JSON 文档。文件保存当前剪辑，不是
Build 图，也不是 undo 日志。

```json
{
  "format": "hypit.nle@1",
  "id": "main",
  "name": "Main edit",
  "revision": 0,
  "editRate": { "numerator": 30, "denominator": 1 },
  "canvas": { "width": 1920, "height": 1080, "clearColor": "#000000" },
  "media": [],
  "tracks": [],
  "transitions": [],
  "mattes": [],
  "groups": []
}
```

## Media 与 Item

媒体箱通过工程相对路径指向可携带的 Media Asset 文档。Manifest 记录已经解释好的主媒体文件，
并可引用由包拥有的转写、遮罩、对象轨迹等 Representation 文件。打开或保存 NLE 不会运行分析，
也不要求媒体字节此刻在线。

Picture 或 Audio Track 包含直接 Item。Item 有三类：

- `media`：对媒体箱条目的一次使用；
- `component`：一个由包拥有的视觉或听觉组件实例；
- `compound`：像普通 source 一样使用的嵌套平面 NLE 工程。

Item 保存精确的放置、trim 与 enabled。Picture Item 还保存明确矩形、`fill | contain | cover`
适配方式和有序特效链；是否参与音频混合及音频特效链也明确保存，不从旁边的画面 Item 猜测。

Picture Track 与其中 Item 均按从后到前排序。这就是绘制顺序；名称和 id 不会暗中参与合成。

## 行为归包所有

Component、Effect、Transition 或 matte 实例只保存包的 module symbol 与 JSON 参数。已安装包的
代码负责验证和执行参数。NLE Core 不维护中央特效枚举、统一 keyframe 语言或手柄清单。

因此新行为可以由包加入，而无需修改工程语法。包也可以贡献参数编辑器或 Canvas 手柄；这些创作
入口是可选能力，不会把组件实现状态写进父工程。

物化后的每条字幕 cue 是普通 Component Item。字幕包拥有文字与外观；NLE Core 不增加特殊字幕
轨道，也不保留转写依赖。

## 编辑关系

- Transition 连接一对明确的 outgoing/incoming overlap；
- matte 让一个 Picture Item 被另一个采样，并检查依赖环；
- Group 只影响编辑选择，lowering 时消失；
- Compound 把子工程闭合为普通画面/音频 source。

Undo/redo 属于打开的文档 session。保存只写入最新工程快照，重新打开时不需要恢复声明图或同步
另一套时间线模型。

继续阅读[精确时间](./timing.md)了解时间字段，或[导出节目](./composition.md)了解单向 lowering。
