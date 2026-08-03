---
title: 创建 SVK 组件
description: 把重复的视频表现封装成可复用组件。
---

# 创建 SVK 组件

SVK 是 SVML 的可复用组件。作者写“我要什么”，组件决定“具体怎样做”。

## 一个最小组件

假设我们想封装一个排名卡片。作者只需要写：

```xml
<script>
  <segment id="ranking">
    <HOST>Here is @winner our number one pick @/winner.
  </segment>
</script>

<ranking-card
  title="Top 5 tools"
  during={script.selection.winner}
/>
```

组件内部负责字体、布局、入场方式和输出的 Track。换句话说，视频作者不需要每次重新搭节点或手调十几个参数。

## 组件应该隐藏什么

- 重复的内部接线和默认值
- 视觉样式、动画和媒体摆放
- 对 HyperFrames 输出的具体实现

## 组件不应该隐藏什么

- 会明显改变作者意图的选择
- 例如硬切、淡入淡出或推拉转场
- 例如这个卡片应该绑定哪一段口播稿

好的组件会提供简单但清楚的选择：

```xml
<ranking-card
  during={script.selection.winner}
  enter="fade 200ms"
  exit="push-left 300ms"
/>
```

## 下一步

需要调用视频生成 API 的组件，还会带一个 Runtime 实现。作者侧只声明内容，Runtime 侧负责请求、排队和下载。参见[运行时与 Provider](/guide/runtime)。
