---
title: Script、转写与字幕
description: 让语义证据保持 source-local，再物化选中的呈现。
---

Script 与转写描述语言、表演和源局部时间。它们在理解与编辑阶段很有价值，但不是第二条节目时间线。

## Source-local 理解

Script 可以命名 segment、selection、speaker 与 moment。Speech evidence 可以把精确词语或短语位置
附加到一段音频的局部域。Narrative timing 连接这些局部事实，但不选择素材之后在剪辑中出现的位置。

因此同一媒体和转写可以被 trim、复用或放置多次。证据包无需知道最终画布、帧率或 NLE 工程。

## 物化字幕

字幕创作选择要显化的 cue 与呈现。显式 materializer 把所选 source-local timing 与一次具体媒体
occurrence 结合，展开成普通字幕 Component Item。

每条已物化 cue 保存直接节目放置和由包拥有的文字、样式等参数。父 NLE 工程没有活的转写查询，
也没有特殊 Caption Track。同一文档可以被多个字幕实例物化为不同 selection 或外观。

物化后，编辑器可以像其他组件实例一样移动、trim、隐藏或改样式。这些操作修改已经接受的呈现；
除非另一个工具明确执行，否则不会反写源转写。

## 语义参考保持可选

编辑器可以把词语边界、selection 或 moment 显示成吸附参考和 inspector。接受吸附只写入精确 NLE
值；预览和导出不会反查语义名称。

这样既能复用理解，也让 NLE 保持平面、立即可编辑。复杂字幕家族和 motion graphics 继续建立在
包拥有的组件上，而不是增加 NLE 原语。

继续阅读[精确时间](./timing.md)和 [NLE 工程结构](./tracks.md)。
