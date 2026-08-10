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

下拉与表单都读自各个 manifest，所以只要模块声明了「输出 `VisualTrack` 的 Producer」，它自己就会出现。

## 控件

模块用 `format` 标注一个字段，说明它的值是什么：

| format | 控件 |
|---|---|
| `color` | 色板配文本框。要带 alpha 就在文本框里写 `#RRGGBBAA` |
| `unit-fraction` | 滑块加数字框 |
| `multiline` | 多行文本框 |
| `digest` | 文件选择 |
| `duration` | 数字框，单位秒 |

## 媒体

`format: "digest"` 的字段接受一个文件，选中即计算哈希。绘制外部素材的组件（B-roll、说话人画面）
在你选择文件之前不画任何东西。

## 出错时

被拒绝的值会把编译器原本的报错显示在画布下方，并保留上一帧正确画面，让你能同时看到错误和图像。

## 与真实渲染的已知偏差

- 字体降级为普通 CSS `font-family` 字符串，不会走生产环境中带哈希 `@font-face` 的
  `FontArtifactRef` 路径。
- 不播放音频轨。
- `ProgramSpace` 输入由画布控件填充，不出现在表单里。

时间线 shim 的原理、以及一个模块需要声明什么才能被预览，见
[`tools/playground/README.md`](https://github.com/cashdiffusion/svml/blob/main/tools/playground/README.md)。
