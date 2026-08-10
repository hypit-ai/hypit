---
title: 组件 Playground
description: 不跑 Build 也能预览视觉组件。
---

# 组件 Playground

想看一条字幕或一个文字层长什么样，通常要付出一整次 Build 的代价：Author Source、Run Source、
Runtime Profile、生成、对齐、渲染。Playground 在浏览器里单独渲染一个组件，耗时以毫秒计。

```bash
pnpm playground
```

然后打开 `http://localhost:5178`。不需要别的——没有 Runtime Profile，没有凭据，也不需要本地服务。

## 界面

| 控件 | 作用 |
|---|---|
| 组件下拉 | 所有能在画面上产生像素的模块 |
| W / H / fps / sec / bg | 画布、帧域与清除颜色 |
| 输入表单 | 组件每个输入各一份 |
| 刻度条 | 帧精确，计数显示为 `当前帧 / 末帧` |

预览运行的是已安装模块真正的 Producer handler，编译出的文档与 Build 渲染的是同一份。

下拉与结构化表单都读自公开 manifest，所以只要模块声明了「输出 `VisualTrack` 的 Producer」，它自己就会出现。

## 硬边界

两条规则永久成立：

1. Playground 只能消费系统，不能定义系统语义。生产 Protocol、Core 与领域包中不得出现任何
   Playground 默认值、UI 提示、fixture、facet 或预览辅助函数。
2. Playground 不维护组件、Recipe、Story、Scenario 或示例注册表，也不定义一套平行的源码格式。
   启动命令可以为本次会话选择包和普通 SVML/SVS/Run 源码；这种局部选择不是中央目录。

通用表单只消费生产合同本来就需要的事实：schema 类型、枚举和数值边界。画布大小、时长、
帧率、背景色和空白表单值都只是本工具内部的会话状态。如果以后需要更丰富的控件或 fixture，
必须在 `tools/playground` 内部实现，不能要求生产包为预览便利而改变。
示例同样必须是普通项目源码，不能成为 Playground 自有注册表中的条目。

## 媒体

内容寻址媒体目前需要填写已有 digest。通用表单不会把生产合同中的任意字符串擅自解释成文件选择器。

## 出错时

被拒绝的值会把编译器原本的报错显示在画布下方，并保留上一帧正确画面，让你能同时看到错误和图像。

## 与真实渲染的已知偏差

- 字体降级为普通 CSS `font-family` 字符串，不会走生产环境中带哈希 `@font-face` 的
  `FontArtifactRef` 路径。
- 不播放音频轨。
- `ProgramSpace` 输入由画布控件填充，不出现在表单里。

时间线 shim 的原理、以及一个模块需要声明什么才能被预览，见
[`tools/playground/README.md`](https://github.com/cashdiffusion/svml/blob/main/tools/playground/README.md)。
