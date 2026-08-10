---
title: 字幕 Playground
description: 直接编辑真实 Fine Caption SVS 配方与精确字体栈，并实时查看结果。
---

# 字幕 Playground

字幕样式确实需要可视化编辑，但编辑器不能变成第二套作者系统。字幕
Playground 直接读写普通 Build 使用的同一份 `.svml` 与 `.svs`。

```bash
pnpm caption:playground -- \
  --source examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock \
  --style base-caption \
  --display story.caption \
  --recipe examples/talking-film-graph-check/studio.svs#caption.base \
  --font examples/talking-film-graph-check/main.svml#caption-font \
  --canvas 1080x1920 \
  --fps 30
```

打开 `http://localhost:5178`。

启动命令显式选择源码、包锁、Style 导出、Display 导出、SVS Recipe、
字体栈以及本地预览画布。系统没有中央组件注册表、隐藏默认样式或
Playground 私有工程文件。

表单编辑的是作者语汇，例如 `size`、`padding`、`fill`，不会暴露
`fontSizePx`、`paddingXPx` 之类编译 DTO。字体家族、字重、字形只在
SVML 的 `<fonts:Stack>` 中声明；SVS 负责字号、位置、绘制、文字盒、
卡拉 OK 与动画。

字体画廊使用每种开源字体自己的固定字节直接展示。选择字体会原子地
修改真实字体栈并重新编译。编辑器或 Agent 修改同一文件也会触发刷新；
浏览器提交时带有旧文件摘要，过期写入不会覆盖更新内容。

为了拖动查看动画，浏览器会临时安排一条展示时间线。这条时间线不写入
Record、SemanticMap、BuildState 或源文件，不会把猜测时间传播进图中。
