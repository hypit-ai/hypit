---
title: NLE 工程中的精确时间
description: 直接有理数放置、源时间与输出采样如何彼此分离。
---

Hypit NLE 工程把已经接受的剪辑保存为直接值。它没有具名 Timeline 对象，也不保留帮助作者
选出时间的表达式、转写匹配或生成来源。

每个 Item 有两个放置值和一份直接源时间关系：

- `start`：Item 在节目时间中的起点；
- `duration`：Item 参与节目的时长；
- `sourceTime.pieces`：每段 Item 局部目标范围从素材或组件局部时间的什么位置读取。

每个值由整数 tick 与有理数 time base 表示：

```json
{
  "ticks": "1001",
  "timeBase": { "numerator": 1, "denominator": 30000 }
}
```

它精确等于 1001/30000 秒，不会舍入到工程显示网格。

普通 1× 读取是一段 affine piece；负 rate 表示倒放，零 rate 表示定格，`wrap` 表示循环，多段 affine
或 cubic piece 可以表达精确变速。工程只保存这些 Item-local pieces。lowering 时，已经解析的媒体或组件
输出提供真实 Source domain，AVIR 才获得完整的 `TemporalMap`。

## editRate 是网格，不是存储单位

独立 Timeline View 中的 `editRate` 告诉编辑器如何显示时间，以及按帧吸附通常落在哪里：

```json
{ "format": "hypit.nle-view@1", "editRate": { "numerator": 30000, "denominator": 1001 } }
```

修改它不会重定时、量化或重新解释已有 Item。媒体音频保留自己的采样域，最终导出另行选择
画面采样率。

## 放置在保存时已经解析完毕

Trim 或移动通过一次带 revision 的 NLE transaction 提交新的精确值。素材标记、转写词语或
分析结果可以由编辑器显示为吸附参考，但接受吸附后只保存得到的时间值；导出不会按名称回查参考。

需要联动编辑时，编辑器在同一 transaction 中更新所有受影响的直接值。这是一次编辑操作，
不是保存工程中的第二套时间权威。

Lowering 时，这些直接值成为 AVIR 中节目时间到源时间的事实映射。组件和特效还可以拥有精确的
Item 局部控制，但参数格式归对应包所有，不属于 NLE Core。

继续阅读 [NLE 工程结构](./tracks.md)了解 Item 与绘制顺序，或
[导出节目](./composition.md)了解输出采样。
