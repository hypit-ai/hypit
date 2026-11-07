---
title: 组件与特效参数
description: 包拥有视觉行为，NLE 保存可编辑实例。
---

Hypit 不为所有视觉角色定义一套中央样式语言。标题卡、字幕家族、画面滤镜、转场和音频特效分别
拥有自身行为需要的参数。

一个 NLE Component 或 Effect 实例保存：

- 精确的 package module symbol；
- module 内的名称；
- 由该包拥有的 canonical JSON 参数。

例如标题组件可以拥有文案与颜色，滤镜可以拥有 opacity、blur 和自己的 Item-local keyframe。
NLE Core 保留这些值，但不解释其拼写。

## 编辑包参数

包代码可以贡献 authoring adapter，读取当前参数并根据编辑操作规划新值。NLE host 把结果转成普通
带 revision 的 Item replacement，因此工程锁、验证、undo 与保存语义仍是权威。

Canvas 手柄和自定义面板是可选能力。许多特效只需要参数控制，并不需要假装拖动一个矩形有意义。

## Author Recipe 与 NLE 实例

SVS Recipe 仍可在 AIGC 或 Source 编译流程中参数化 Author component，它属于那张声明图。组件一旦
物化进 NLE，已接受实例保存直接包参数，而不是活的 Recipe 查找。

这种分离保持组件去中心化：增加组件或特效只需增加包，不需要新增 NLE kind 或修改渲染工程语法。

继续阅读[添加作者包](../guide/author-packages.md)和 [NLE 工程结构](./tracks.md)。
