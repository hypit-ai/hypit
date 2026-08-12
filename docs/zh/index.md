---
layout: home

hero:
  name: "Narratage"
  text: "写下故事，编译视频。"
  tagline: "面向 AI 视频生产的语义化图系统。作者意图保持可读，生成、定位、Track 与渲染由可替换的包完成。"
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/quickstart
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/hypit-ai/narratage

features:
  - title: 先表达意义，再处理时间线
    details: 写口播稿、语义区间和视觉意图；组件负责定位与呈现，作者源码不必退化成逐帧编辑指令。
  - title: 花钱之前先看 Plan
    details: Provider 启动前先编译真正需要的子图，清楚看到每个 Candidate、Operation 与外部 Need。
  - title: 包，而非中央能力表
    details: 模型、Track、Provider、Store 与 Runtime 都能独立安装；Core 不维护视频组件名单。
  - title: 可留存的创作过程
    details: 已接受的图片、视频、证据和渲染都会成为显式结果，之后的 Run 可以有意识地复用。
---

<ClientOnly>
  <SvmlDemoCarousel />
</ClientOnly>
