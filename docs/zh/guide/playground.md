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
| W / H / fps / sec | 画布与帧域 |
| Appearance from a stylesheet | 采用某个 `.svs` Film Recipe 的背景 |
| 输入表单 | 组件每个输入各一份 |
| 刻度条 | 帧精确，计数显示为 `当前帧 / 末帧` |

预览运行的是已安装模块真正的 Producer handler。例如 Fine Caption、Media Track、
Screen Overlay、Speech Basis 和 Typography Track 都会降低为 `VisualTrack`，再由
`compileHyperframesDocument` 产出与 Build 相同的文档。

## 它不维护任何清单

Playground 里没有组件列表。它读取各 manifest，把所有声明了「输出 `VisualTrack` 的 Producer」的模块
列出来。新增这样的模块，它自己会出现；不再输出，它自己会消失。

其余信息同样是读出来的：

| 问题 | 来源 |
|---|---|
| 组件需要什么 | 该 Producer 的 `inputs` |
| 每个输入什么形状 | 声明方的 `TypeDeclaration.schema` |
| 从什么值开始 | 该类型的 `TypeDeclaration.default` |
| 控件长什么样 | `ValueSchema.format` |

所以字幕的 `mode` 是下拉框，因为它的 schema 声明了 `enum`；`display` 是多行文本框，因为该字段是
`format: "multiline"`。这两者都不在 Playground 里配置。

## format

当类型本身不足以表达含义时，模块用 `format` 说明——颜色和字体名同样都是字符串。

| format | 控件 |
|---|---|
| `color` | 色板配文本框。以文本框为准，因为 `#RRGGBBAA` 带的 alpha 色板表达不了 |
| `unit-fraction` | 滑块加数字框 |
| `multiline` | 多行文本框 |
| `digest` | 文件选择 |
| `duration` | 数字框，单位秒 |

`color` 和 `digest` 有确切形状，由 `validateStoredValue` 校验。其余只描述，不收窄。

## 媒体

`format: "digest"` 的字段接受一个文件。Playground 用 SHA-256 计算并注册真实的内容寻址标识——
编译产出的文档会交叉校验每一个 Artifact 引用，占位值会被拒绝。

因此绘制外部素材的模块（B-roll、说话人画面）**没有默认值**：模块手里没有那些字节，与其编造一个
digest，不如什么都不说。在你选择文件之前这些组件不画任何东西，这是一个可以经过的状态，不是错误。

## 样式表

选择 `.svs` 文件**只读其中的 Film Recipe**，且只用于 Film 外观。指向
`examples/talking-film-golden/studio.svs`，预览会采用该 Recipe 的背景色；画布尺寸与时间仍由
预览环境的显式控件决定。

表里其余内容一概不读。组件长什么样由拥有它的模块决定，而不是由 Playground 恰好打开的某张样式表决定。

## 出错时

Playground 自身不做任何校验。裁判是各模块自己的 `seal` 与 `assert` 函数——它们正是真实 Build 会跑的
东西。被拒绝的值会把编译器原本的报错显示在画布下方，并保留上一帧正确画面，让你能同时看到错误和图像。

## 与真实渲染的已知偏差

- 字体降级为普通 CSS `font-family` 字符串，不会走生产环境中带哈希 `@font-face` 的
  `FontArtifactRef` 路径。
- 不播放音频轨。
- `ProgramSpace` 输入由画布控件填充而非出现在表单里，使帧域只有一处可改。

时间线 shim 的原理、以及一个模块需要声明什么才能被预览，见
[`tools/playground/README.md`](https://github.com/cashdiffusion/svml/blob/main/tools/playground/README.md)。
