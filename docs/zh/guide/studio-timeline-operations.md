---
title: Studio 作者操作
description: timeline.adjust 与 parameter.adjust 如何修改真正的作者关系。
---

# Studio 作者操作

Studio 面向批量 AIGC 广告生产：先把第一个范例的样式和编排调明白，再复用于后续 1–100 条
视频。它只公开两种作者操作：`timeline.adjust` 和 `parameter.adjust`。

## `timeline.adjust`

`move`、`trim-start`、`trim-end` 是同一操作的手势载荷。Studio 不按组件名、属性名或相同帧
区间猜写回，而是读取实体实际执行得到的 Instant/Window 端点 authority：

- Selection 端点移动 Script 中的 Selection markers；全部消费者一起变化；
- Moment 端点移动 Script 中的 Moment marker；
- `for`、`start`、`end`、`instant` 修改组件表面的精确 SVML range；
- Program 与 Segment 的结构端点保持只读。

`at/for` 和 `until/for` 是混合 authority。一个 trim 可能同时产生 Script patch 与 SVML patch，
但仍然只是一笔 `timeline.adjust`。浏览器在拖动中只做几何预览，松手后提交一次；服务端按
当前 Snapshot revision 再验证 authority、应用全部 patch、重新编译，失败则全部回退。

Selection 只能落在 Script 和 Semantic Candidate 公开的 token/segment 首尾 Anchor。拖起点只改
开始 marker，拖终点只改结束 marker，拖窗口按相同 Anchor 序号增量移动两个端点。它不会修改
WhisperX 的声学时间，也不会把 Selection 偷换成绝对帧。

## `parameter.adjust`

右侧面板只展示 Companion 明确声明的作者参数：

- SVML 字面量写回 SVML；
- 引用到的 Frame/Extent 写回自己的定义；
- SVS Recipe 属性写回对应 `.svs`；
- 引用关系和 SVRun Candidate/Provider 事实保持只读。

参数控件在明确 change 后提交，不在每次键入或滚轮事件中重新编译。动态 list、color、record
仍使用同一个 `parameter.adjust`，由公共 schema 验证后原子写回。

## 组件与 Studio 的责任

组件包声明时间输入契约并只消费 `TemporalInstant` / `TemporalWindow`；`temporal-markup` 统一
负责作者语法到投影图的 lowering；Studio Companion 声明外观和可见参数；Studio 核心根据运行
图 authority 提供有限的通用拖动、Anchor 吸附、revision、编译验收和失败回退。

没有长期文件锁、额外 lock.json、内容哈希、隐藏 Build、Provider 调用或高频写入恢复协议。
