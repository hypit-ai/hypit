---
title: 组件结构
description: 将场景的创作接口变成可复用的图贡献。
---

组件把作者面对的创作想法与具体实现连接起来。对于榜单，这个想法可以是“说到每个候选时介绍它，再让图标移动到对应排名位置”。输入表达这些关系，代码完成绘制和运动。

[添加作者包](./author-packages.md) 提供完整可构建的起点。[Ranking](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/README.md) 则展示更丰富的语义事件、持久视觉状态和 Studio Companion。

## 实现中的职责

这些职责可以按组件规模组织到合适的文件中：

| 部分 | 职责 |
| --- | --- |
| Manifest 与 Types | 命名包提供的值、Producer、输入和输出 |
| Surface | 读取作者元素，解析明确输入 |
| Fragment | 描述输入到输出之间的操作与依赖 |
| Producer | 完成声明的计算 |
| 值与样式辅助函数 | 验证输入、应用已说明的默认值、解析接受的 Recipe 属性 |
| 调度与绘制 | 投影事件，并在每一帧绘制场景 |
| Activation | 公开所选包提供的贡献 |
| Studio Companion | 描述时间线 Item 与可编辑属性 |

精确对象形状由 [Author Package 指南](./author-packages.md) 和随包示例指向各自所有者。小组件可以把相关职责放在一起；大组件则可以分离可复用的调度、样式和绘制逻辑。

## 围绕关系设计

对于说话视频，上游 Narrative Projection 会在表演产生后，把选中的语义身份显影为具名绝对
Window 和 Instant；组件只接受这些绝对类型来表达随词语发生的行为。作者决定节奏的动画则由
Timeline 声明直接从秒或帧产生相同类型；`12f` 这样的时长仍可表达组件内部一次转场的长度。

素材呈现、空间布局与时间各有自己的输入。PreparedMedia 提供有限的局部媒体域，Window 表示这次
occurrence 何时贡献画面，独立的源时间关系决定采样含时素材的哪一部分。Frame 定位场景，内部
HTML/CSS 或元素树协调视频、文字、遮罩和图形。共享行为的内容组织在一起，独立贡献可以继续
作为由父 Film 或 Stack 单独放置的 Track。

字幕组件可以沿用已有字幕文档、样式选择与语义时间。细粒度字幕族能表达的样式可以直接使用；新的样式族则可以消费相同字幕关系，绘制不同的视觉呈现。

## 让另一个作者用得好

从创作决定命名参数：出现事件、内容、位置、外观。说明默认值和覆盖后改变什么。Style 解码器接收 `{ path, properties }` 形状的 SVS Recipe 与明确字体资源，Source 通过作者 id 引用 Style。

具体视频的文案和媒体作为输入。组件绘制自己的图形结构，也可以携带可复用字体或图标等资源。示例 Source 展示关键状态，包括换内容或改变事件时间后的行为。

包的 README 与 vocabulary 帮助作者选择和使用组件。Studio Companion 可以为含义明确的 Source 值添加编辑手柄。新的视觉行为在组件包内实现；图需要外部执行时，由 Provider 完成。
