---
title: Studio 中的时间编辑
description: 在保留作者含义的前提下移动和裁剪具名 Instant 与 Window。
---

组件使用具名绝对 Instant 与 Window。Studio 修改为所选 Item 提供时间的 Source 声明。

## 直接时间声明

| Source 写法 | 移动时改变什么 | 裁剪时改变什么 |
| --- | --- | --- |
| `from="2s" for="8f"` | 改 `from`，时长仍为八帧 | 左侧：同时改 `from` 与 `for`；右侧：改 `for` |
| `until="3s" for="8f"` | 改 `until`，时长仍为八帧 | 左侧：改 `for`；右侧：同时改 `until` 与 `for` |
| `from="1s" until="3s"` | 两个端点移动相同帧数 | 被选择的端点 |
| 组件 `during={named-window}` | 修改该具名 Window 声明 | 修改声明中的所选关系 |

Instant 引用遵循同样规则：`at={claim}` 修改 `claim` 的具名声明。每次拖动都保留没有被改变的部分：裁剪左侧时保持原结束点，裁剪右侧时保持原开始点，整体移动时保持原长度。

没有编辑的表达式保留原单位。帧率变化时，`2s` 仍是两秒，`60f` 仍是六十帧；修改后的时间位置写在当前 Timeline 的整帧边界上。

## 语义时间

语义时间先投影，再由组件使用：

```svml
<semantic:Projection id="story-time" narrative={story} timeline={film.timeline}>
  <semantic:Map alignment={speech.alignment} domain={speech-media.domain} window={film.speech}/>
</semantic:Projection>
<semantic:Window id="proof" projection={story-time} during={story.selection.proof}/>
<semantic:Instant id="reveal" projection={story-time} at={story.moment.reveal}/>

<visual:Clip during={proof} .../>
<deck:Card at={reveal} .../>
```

所选组件支持这类编辑时，移动 `proof` 或 `reveal` 会修改对应 Script 锚点，所有使用位置在重新编译后一起更新。组件仍然只使用普通绝对 Window 或 Instant。

有些表达式对应多种可能的作者选择，例如修改 `earliest(...)` 或 `latest(...)` 时必须决定改变哪个分支。Studio 将这类值显示为只读；需要修改时直接编辑预期的 Source 表达式。

[Studio](../quickstart/preview.md) 介绍编辑界面，[Companion 指南](./studio-companions.md) 介绍组件 Item 与控件。
