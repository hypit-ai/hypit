---
title: Quickstart
description: 在几分钟内检查并编译第一支 SVML 视频。
---

# Quickstart

从一份口播稿开始，编译出可交给 HyperFrames 渲染的视频页面。

## 安装

SVML 目前需要 Node.js 22 和 pnpm。

```bash
pnpm install
pnpm build
```

## 先看一个真实例子

仓库里的 Ranking 示例用 `@name … @/name` 在口播稿中声明语义范围，再让组件消费这个范围。下面是核心节选：

```xml
<svml version="1">
  <import from="../../stdlib/ranking-column.svk"/>

  <script>
    <segment id="ranking">
      <NARRATOR> @photoshop Photoshop.
      <SPEAKER> Powerful, but only if you know how to use it.
                Otherwise it becomes a three-hour project @/photoshop.
    </segment>
  </script>

  <ranking-column id="ranking" z="42">
    <item
      id="photoshop"
      rank="5"
      image={ranking-icon-5}
      during={script.selection.photoshop}
    />
  </ranking-column>
</svml>
```

这里没有手写“第 3 秒到第 7 秒”。定位器会根据口播与媒体，把 `photoshop` Selection 解析成这次构建的真实时间。

## 检查与编译

```bash
pnpm svml check examples/regen-ranking/regen-ranking.svml
pnpm svml lock examples/regen-ranking/regen-ranking.svml --out svml.lock
pnpm svml compile examples/regen-ranking/regen-ranking.svml \
  --lock svml.lock \
  --out build/index.html
```

`check` 检查声明是否完整；`lock` 固定本次构建实际使用的输入；`compile` 生成确定的 HyperFrames HTML。

## 渲染

```bash
pnpm svml render build/index.html --out build/video.mp4
```

::: warning 当前状态
可执行示例需要其本地媒体和对齐证据。在线 Provider 自动加载尚未实现。
:::

接下来可以去[开发指南](/zh/guide/components)，了解怎样把常用视觉封装成 SVK 组件。
