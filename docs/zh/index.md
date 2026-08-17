---
layout: home

# 标题由 HeroMasthead.vue 渲染，它替换了默认的 hero 信息区；这里只有 actions 会被读取。
hero:
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/quickstart
    - theme: alt
      text: 开发指南
      link: /zh/guide/develop
---

<ClientOnly>
  <SvmlDemoCarousel />
</ClientOnly>
