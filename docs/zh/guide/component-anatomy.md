---
title: 组件设计
description: 将场景的创作接口变成可复用的项目组件。
---

组件把作者面对的创作想法与具体实现连接起来。对于榜单，这个想法可以是“说到每个候选时介绍它，再让图标移动到对应排名位置”。输入表达这些关系，代码完成绘制和运动。

[添加作者包](./author-packages.md) 提供完整可构建的起点。[Ranking](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/README.md) 则展示更丰富的语义事件和持久视觉状态。

## 从作者面对的行为开始

用组件提供的视觉或听觉角色命名它。Source 接口公开另一个作者会有意修改的内容、位置、外观和有意义事件。调度与绘制共同表达一种行为时可以放在一起；文件拆分只服务于理解和维护。准确 TypeScript 文件布局与 API 由随包 README 说明。

## 围绕关系设计

对于说话视频，source-local 转写 selection 与词时间可以参与物化。被接受的组件实例接收直接放置
与包参数；预览和导出时不会查询全局 Timeline。包拥有的 Item-local control 仍可表达精确内部动画时间。

素材呈现、空间布局与时间保持为不同关系。NLE Item 拥有节目放置与 trim，source 拥有局部媒体时间，
AVIR lowering 时由明确映射连接。Picture layout 定位实例，内部 HTML/CSS 或元素树协调视频、文字、
遮罩和图形。共享行为的内容组织在一起，独立贡献保持为具有明确绘制顺序的独立 Item。

字幕家族可以在物化 cue 时消费字幕文档和 source-local timing。得到的每个 Component Present 保存文字
与呈现参数；新的字幕家族可以把同一证据物化为另一种视觉行为，而不增加 NLE 原语。

## 让另一个作者用得好

从创作决定命名参数：出现事件、内容、位置、外观。说明默认值和覆盖后改变什么。Style 解码器接收 `{ path, properties }` 形状的 SVS Recipe 与明确字体资源，Source 通过作者 id 引用 Style。

具体视频的文案和媒体作为输入。组件绘制自己的图形结构，也可以携带可复用字体或图标等资源。示例 Source 展示关键状态，包括换内容或改变事件时间后的行为。

包的 README 与 vocabulary 帮助作者选择和使用组件。新的视觉行为在组件包内实现；图需要外部执行时，由 Provider 完成。
