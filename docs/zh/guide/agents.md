---
title: 在你的 Agent 中使用 Hypit
description: 选择与 Agent 协作的入口，安装 Hypit，并让视频项目持续可用。
---

Hypit 为 Agent 提供视频制作知识与执行工具。你与 Agent 沟通，它读写项目、制作素材并运行编排。
选择哪个 Agent，与选择哪些[模型和部署服务](./service-partners.md)来制作素材，是两件事。

## 从你的工作环境开始

Claude Code 和 Codex 是常用入口。在 Agent 中打开视频项目，通过它支持的 Skill 安装方式安装 Hypit。
使用 skills CLI 时，命令为：

```bash
npx skills add hypit-ai/hypit -g
```

随后 Agent 可以找到或安装 `@hypit/hypit` 可执行程序。把参考视频或创作要求交给它，说明想要的结果。
[快速开始](../quickstart.md) 介绍实际制作过程。这里列出的是使用方式；合作关系在下方单独标明。

终端、桌面应用或浏览器都可以是入口。真正影响制作的是背后的工作环境：能否访问项目文件、
执行 Hypit 与所选工具，以及把作品展示给你。使用远程 Agent 时，将素材交给它实际运行的环境，
通过该环境的预览转发或文件交付查看作品。远程机器的 localhost 地址，并不是你电脑上的预览地址。

项目和生成素材应当在会话或临时环境结束后仍然可用。Agent 可以说明文件保存位置，用有针对性的
画面或区间收集反馈，并修改真正拥有该变化的 Source 或组件。审阅编排与导出最终视频是不同的操作。

## Agent 入口合作方：OpenAgents

[OpenAgents](https://openagents.org/) 是 Hypit 的 Agent 入口合作方。它的
[Launcher 与工作区文档](https://openagents.org/docs/en/launcher/what-is-launcher)
介绍了如何管理 Coding Agent，并将其连接到共享工作区。

在你通过它运行的 Agent 工作环境中使用 Hypit。Hypit Skill 的维护源是仓库的
[`skills/hypit/`](https://github.com/hypit-ai/hypit/tree/main/skills/hypit) 目录；安装时包含引用页与支持文件。
具体入口和安装选项遵循 OpenAgents 当前提供的方法，制作仍使用同一套 Hypit 工具与项目文件。
Skill 由所选安装渠道更新，可执行程序通过自己的包安装更新；模型服务账户另外选择。

## 接入其他 Agent 环境

集成方可以提供 Skill 的读取与安装、项目文件和命令执行能力，以及预览和成片的访问方式。
它沿用 Hypit 已有接口，不需要为每个 Agent 创造另一套视频语法或 Provider。
从环境实际开放的能力出发，把作品保存在哪里、能保存多久、怎样查看交代清楚。

素材生成的接入见[模型与 Provider](./providers.md)和[模型与部署服务合作方](./service-partners.md)。
