---
title: NLE 工程结构
description: 工程文件中的 Present 与 Adjustment Component，以及独立的时间线 View。
---

可编辑的 Hypit 节目是一份标记为 `hypit.nle@1` 的严格 JSON 文档。文件保存当前剪辑，不是
Build 图，也不是 undo 日志。

```json
{
  "format": "hypit.nle@1",
  "id": "main",
  "name": "Main edit",
  "revision": 0,
  "canvas": { "width": 1920, "height": 1080, "clearColor": "#000000" },
  "media": [],
  "tracks": [],
  "transitions": [],
  "mattes": []
}
```

另一份 `hypit.nle-view@1` 文件引用该 Project，并保存编辑网格、Track lock 与联动编辑 Group。Selection、
playhead 和 zoom 属于 session；缩略图与波形属于可再生成缓存。

## Media 与 Item

媒体箱通过工程相对路径指向可携带的 Media Asset 文档。Manifest 记录已经解释好的主媒体文件，
并可引用由包拥有的转写、遮罩、对象轨迹等 Representation 文件。打开或保存 NLE 不会运行分析，
也不要求媒体字节此刻在线。

Picture 或 Audio Track 包含直接 Item。Item 先表达两种编排角色：

- `present`：贡献一个 source，再以 `media`、包 `component` 或嵌套 `composition` 选择来源；
- `adjustment`：用包拥有的 Picture 或 Audio Component 处理其下方已累积的结果。

Item 保存精确的放置、trim 与 enabled。Picture Present 还保存明确矩形和
`fill | contain | cover` 适配方式；是否参与音频混合也明确保存，不从旁边的画面 Present 猜测。
Adjustment 拥有自己的范围和局部时间，因此可以独立移动、裁剪和制作动画。

Picture Track 与其中 Item 均按从后到前排序。这就是绘制顺序；名称和 id 不会暗中参与合成。

## 行为归包所有

Present Component、Adjustment Component、Transition 或 matte 实例只保存包的 module symbol 与 JSON 参数。已安装包的
代码负责验证和执行参数。NLE Core 不维护中央 Adjustment 枚举、统一 keyframe 语言或手柄清单。

因此新行为可以由包加入，而无需修改工程语法。包也可以贡献参数编辑器或 Canvas 手柄；这些创作
入口是可选能力，不会把组件实现状态写进父工程。

物化后的每条字幕 cue 是普通 Component Present。字幕包拥有文字与外观；NLE Core 不增加特殊字幕
轨道，也不保留转写依赖。

## 编辑关系

- Transition 连接一对明确的 outgoing/incoming overlap；
- matte 让一个 Picture Item 被另一个采样，并检查依赖环；
- Timeline View Group 只影响联动编辑，不进入 lowering；
- Composition source Present 把子 Composition 闭合为普通画面/音频 source。

Undo/redo 属于打开的文档 session。保存只写入最新工程快照，重新打开时不需要恢复声明图或同步
另一套时间线模型。

继续阅读[精确时间](./timing.md)了解时间字段，或[导出节目](./composition.md)了解单向 lowering。
