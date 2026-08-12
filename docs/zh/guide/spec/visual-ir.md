---
title: SVML Visual IR
description: 已实现的仓库内部 `@1` 兼容窄腰；尚未作为 npm ABI 发布。
---

# SVML Visual IR

状态：已实现的仓库内部 `@1` 兼容窄腰；尚未作为 npm ABI 发布。

## 定位

`svml.visual-ir@1` 是官方 SVML 视频栈共享的唯一一种无代码的终端视觉语言。它是：

- 一份公开的视频领域协议；
- 不是作者组件；
- 不是 Provider API；
- 不属于领域无关的 Core。

Text、Caption、Media、Ranking 以及第三方视觉包可以各自持有互不相干的作者 Program。但在进入
`Composition` 之前，每个包都必须把自己解析后的结果下降为一个显式指明本 IR 的 `VisualTrack`。渲染器
adapter 校验并编译这门共同语言；它永远不需要知道来源是哪个组件家族。`@narratage/hyperframes` 是第一个参考 adapter，而不是协议的持有者。

```text
author Program                 shared terminal protocol             final-render route
─────────────────────         ─────────────────────────            ─────────────────────
Text / Caption / Media   ───>  SVML Visual IR in Track      ───┬─> HyperFrames
custom visual producer   ───>  typed CompositableSurface    ───┤
                                                              ├─> future Remotion
                                                              └─> future render API
```

把它称作组件“方言”是一种误导。当前视频栈只有一个官方目标协议。一个组件不可能引入另一套 CSS 语义，同时还声称自己产出的是同一份 IR。

## 合同

每一份 `svml.visual-track@1` 都携带：

```text
visualIr = svml.visual-ir@1
```

这个值先被携带该 Track 的 Record 覆盖，再经由 Composition 与所选渲染器文档的 Record 传递覆盖。Runtime
不能用另一种视觉语言去重新解释一份已经编译完成的 Track。

该 IR 只包含：

- 带绝对堆叠键、帧级精确的 Present；
- 每个 Present 局部的一棵由 `box`、`text`、`image`、`video` 或 `surface` 元素构成的树；
- 内容寻址的媒体、字体与 Surface 引用；
- 一份封闭的、面向浏览器的样式声明清单；
- 按帧寻址、作用于 opacity、transform、filter 与 clip 的局部 keyframe；
- 安全的 data/ARIA 属性。

它不包含组件家族、作者 recipe、provider 名称、选择器、脚本、外部 URL、运行时凭据、同级 Track 引用，也不包含累积合成输入。

## 封闭的渲染词汇

实现导出 `VISUAL_STYLE_NAMES_V1`。不在该清单内的声明一律非法，即使某个特定的 Chromium 构建恰好能理解它。
`position`、`display`、`overflow`、`object-fit`、direction 和 writing mode 这类关键的枚举型事实，还额外使用封闭值集。

以下情况一律失败关闭：

- 未知的 CSS 属性；
- `position: fixed` 与滚动布局；
- `backdrop-filter` 或 `mix-blend-mode` 的跨 Track 采样；
- 用 CSS `url(...)` 代替带类型的 Artifact 引用；
- `var(...)`、`env(...)` 或 `attr(...)` 这类依赖环境的值；
- 会破坏声明结构的标点；
- 对局部动画集合之外属性的动画。

这有意不是“把任意 CSS 塞进 JSON”。这种 CSS 形状的表示，仅仅是被锁定浏览器目标的序列化指令词汇。

## 校验归属

校验有四个彼此独立的持有者：

1. `@narratage/visual-ir` 持有封闭词汇与身份；
2. `@narratage/composition` 持有 Track schema 与内在自包含性校验；
3. Film 与最终渲染 Producer 通过显式图边接收 ProgramSpace，校验关系型的帧域事实，而不往 Track 值里添加
   血缘字段；
4. 被选中的本地或托管渲染 Endpoint 锁定实际的渲染器实现，并校验产出的媒体事实。

Core 内不含任何视频专用分支。它的通用准入通路会调用已安装的 Type 持有者 validator，来校验内在的树、样式与 Artifact 事实。涉及另一个值的关系性校验，仍然是普通的多输入 Producer 检查。

## 扩展法则

安装一个新的视觉组件不得修改本协议。该组件只能二选一：

1. 把自己的 Program 下降为已有的元素与样式；或者
2. 把它所持有的视觉物化为一个带类型的 `CompositableSurface`，并贡献该 Surface。

只有当某项能力既具备广泛复用价值，又无法通过上述两条路径表达时，才有理由改动 `svml.visual-ir@1` 合同。在 Narratage 处于预发布阶段期间，标识符保持为 `@1`，确切的实现身份由摘要和 package lock 承载。新增一种
Text 样式、Caption 模式、Media recipe、转场或 Provider，本身永远不构成理由。

因此，旧系统的 Text 三盒模型、Caption 的 range/cue/content 模型和 Media 的内容帧采样模型，都属于包自有的
Program 与下降证据。它们是本 IR 表达力的见证，而不是被加进 IR 的字段。

## 冻结证据

标识符与封闭词汇都是可执行的。精确的 Text 字体、多行装饰、Path/Mask/overflow、Media 焦点采样和 alpha 现在都有真实的浏览器证据；一个单独安装的非原生 Text 包可以穿过带类型的 Surface 窄腰，而不改动 Core、Film 或
HyperFrames。仓库内部的 `@1` 窄腰之所以被冻结，是因为以下四道彼此独立的闸门现在都能真正执行：

1. 通用的 Need Receipt 绑定被锁定的 Endpoint 实现/配置/Runtime closure，同时 HyperFrames 那份被 receipt
   覆盖的 attestation，在本地绑定确切的浏览器字节，在远端绑定显式配置的不可变渲染器部署摘要；
2. 共享的媒体执行器在本地渲染之前解码 Surface 字节，并证明尺寸、帧时序、SDR/sRGB 兼容性以及
   opaque/straight-alpha 事实；不具备该 verifier 的渲染器 Endpoint 必须拒绝携带 Surface 的文档；
3. Deck 与 Ranking 提供其余的包自有 Track 表达力见证；
4. 全仓库的边界审查证明 Composition 中不含任何包家族/provider 判别字段，且终端编译器中不存在隐藏的跨 Track
   采样通路。

这为本仓库后续的包开发冻结了该协议。它并不意味着 npm 包已经发布、每个作者 Surface 都已冻结，也不意味着未来的公开发布可以跳过分发与安全审查。
