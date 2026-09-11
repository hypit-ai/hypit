---
title: Studio Companion
description: 为组件提供有意义的时间线实体和 Studio 编辑控件。
---

组件绘制视频，**Studio Companion** 向编辑器解释组件：哪些对象出现在时间线上，标签代表什么，哪些 Source 属性可以编辑。项目组件由此可以提供实用控件，同时保持视觉实现的可复用性。

## 与组件一起分发

Companion 是应用贡献。项目组件可以在同一个物理包中，以独立文件和 facet 携带它；官方 Distribution 通过独立包提供官方 Companion。两种情况下，Studio 都加载当前 Source 和 Distribution 所选包的 Companion。

[Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-adapter/README.md) 提供 activation 与接口示例。外部包使用 `@hypit/hypit/studio-adapter`，将 Companion 编译为 JavaScript 并与组件一起分发。修改安装代码后，重启 Studio 加载新贡献。

## 描述作者面对的对象

Track Companion 匹配组件的终端 Type 与作者 Surface，使用组件公开值描述时间线实体、标签、素材预览和 Inspector 字段。图形可以公开外观、内容、位置和事件时间，而不必暴露每一个内部绘制数值。

控件与交互由 Studio 提供，Companion 选择标量、列表或记录控件，并将其绑定到 Source 值。Film Companion 指明 Film 的时间来源与 Track；Script Companion 支持移动 Selection、Moment 标记所需的源码映射。作者声明的 ProgramSpace 支持没有 Script 轨道的动画。

## 让编辑保留含义

时间线编辑沿用所选时间关系。移动共享 Script 事件会改变标记与其消费者；基于参数的手柄修改对应作者参数。没有可支持反向编辑的值，仍可供查看。

Inspector 字段绑定到实际修改的作者值。共享 Recipe 或 Frame 可能影响多个使用位置，因此字段代表的是这项共享决定。Studio 将修改写到对应 Source，以同一份 Run 重新编译；修改无法发布时，显示错误并恢复之前的文件。

[Studio 时间谱系](./studio-temporal-windows.md) 介绍这些关系如何在投影后保留作者含义，[Studio](../quickstart/preview.md) 介绍编辑界面。
