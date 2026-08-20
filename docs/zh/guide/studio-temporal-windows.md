---
title: Studio 三窗口
description: Studio 如何显式呈现选择、投影与消费窗口的待设计记录。
---

# Studio 三窗口

> 状态：只读呈现已经定案并开始实现；回写交互仍待讨论，不因此新增 Core 协议。

时间线上的 item 并不只是一个起止帧矩形。绝大多数 Track 先引用 Selection、Segment 或
Moment，再把它投影到帧空间，最后才由画面、声音、动画或组件内部 schedule 消费。Studio
必须保留这三个层级，不能压平后靠相同帧数、字符串 id 或组件名字猜回去。

## 一、选择窗口

这是作者选中的语义来源，需要保留来源种类、规范 id、occurrence、Semantic Track 上的
Anchor，以及引用它的 SVML 源码范围。Moment 可以只是一个点；重复 Selection 可以有多次
occurrence。两个来源落在相同帧上，不代表它们是同一件事。

## 二、投影窗口

这是 Track 把一次语义 occurrence 按时间表达式投进帧空间后的结果。例如完整使用
Selection、从 Moment 前三帧开始，或从 `segment.start + 2s` 到 `segment.end`。它包括
occurrence 展开、offset 计算、Program Space 裁切与帧量化。

一个作者绑定可以产出零个、一个或多个投影窗口；组件也可能在这些窗口之间施加关系，
例如算出互不重叠的 Ranking reveal。关系必须来自领域组件公开的 programme/schedule，
不能由 Studio 重新实现。

## 三、消费窗口

这是最终 Track 实际使用的窗口。它可能与投影窗口相同，但不能预设相同：Media Sequence
同时有 logical span、visual span 与 handoff；源音频有 source trim 和 target window；
Ranking 有一个外层窗口和多个内部 reveal；进入、持续、退出动画也会消费生命周期的不同
部分。Studio 应读取领域 programme、schedule、Visual Track 或 Audio Track 公开的事实，
不能从渲染 id 猜。

## 时间线呈现约定

三者是时间谱系的三层，不保证都是区间。Semantic Lane 始终显示语义来源：Selection 和
Segment 是括号区间，Moment 是精确时间点。每个 Track 的作者 item 仍用实心块表达实际
消费；它的顶部用空心细线表达投影窗口。投影与消费完全重合时也保留细线，不能因此抹掉
恒等投影。选中 item 后，Semantic Lane 会强调它绑定的来源和 occurrence。

组件内部 schedule 不制造额外 Track item。Ranking Column 的整个 Column 是父 item；每个
ColumnItem 是子 item，`preferred` 显示为投影线，`active` 和 `settled` 显示为同一子 item
底部的阶段条。Preset 没有独立语义投影，明确标记为由父 schedule 派生。

投影端点必须逐个保留原表达式，例如 `selection.start+3f` 和 `selection.end+3f`，不能在
Studio 中概括成一次“整体平移”。Program 给出解析后的帧窗口，Surface 真正封存的 Spec
给出端点表达式；Studio adapter 只把它们按作者实体重新组合，不重新执行 Temporal。

## 必须保留的身份链

```text
作者元素
  -> 语义绑定（种类、来源 id、occurrence、源码范围）
  -> 投影表达式与投影窗口
  -> 消费实体与消费窗口
  -> 最终画面/声音实现
```

多个 Track 可以共享同一个 Selection；一个投影可以生成同源的 visual/audio facet；一个
组件的外层投影也可以展开成多个内部消费窗口。它们是共享绑定和投影，不是若干恰好重叠
的 clip。

Studio adapter registry 是解释这条链的本地中心。领域包和 Core 不认识 Studio；adapter
复用 Narrative、Temporal 和 Track family 已公开的值。如果链上某一环不可观察，就明确
显示 unresolved，绝不通过名称或相同 span 补猜。

## 回写前必须显式讨论的问题

1. 共享 Selection 如何展示所有消费者及修改影响范围。
2. Inspector 如何在语义来源、投影 occurrence、消费实体和最终 realization 之间切换。
3. 每种拖动到底修改哪一层：移动语义来源、修改 projection offset、裁切消费窗口是三种
   不同操作，严禁相互替代。

这些问题定案前，时间线可以选中、定位，但保持只读。可以难，不能隐式猜。
