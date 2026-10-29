---
title: 包与扩展
description: 视频项目如何通过普通包选择组件、模型和服务。
---

Hypit 项目把可复用组件、生成模型和服务作为普通包安装，并在使用位置选择它们。

## 各部分的职责

| 部分 | 职责 | 在哪里选择 |
| --- | --- | --- |
| 作者组件 | 将作者输入转成素材请求、视觉行为或其他输出 | Source 导入 |
| Model | 定义明确的生成请求与输出 | Source 导入 |
| Provider Endpoint | 通过 API 或本地工具执行支持的请求 | Runtime Profile |
| 凭据存储 | 为 Endpoint 解析具名凭据 | Runtime Profile |
| Results | 保留项目的 Build 记录与产物文件 | 项目的 `.hypit/results` |
| Hypit 安装 | 提供命令与随附包 | 安装的 `hypit` 版本 |

例如，Model 描述要生成的视频，Provider 将请求映射到服务；Ranking 组件描述榜单的行为，渲染器将其绘制到最终编排。两者都使用明确的输入与输出。

## 组件随作品需要组织

在适合提取秩序的地方组织空间。Visual Track 可以呈现普通视频或图片；项目组件可以把移动的视频视口、标签和流程图作为一个场景协调起来。独立字幕或叠加层仍可分开。共享行为决定哪些内容属于同一个组件。

对于说话视频，Narrative Projection 可以把 Script Selection 与 Moment 显影成组件消费的绝对
Window 与 Instant；作者主导节奏的动画，则可以在声明的时钟上从秒或帧直接产生相同类型。
[Film 与渲染](../quickstart/composition.md) 介绍这些贡献如何组成作品。

新组件通常放在视频项目的 `packages/` 中，使用所有者自己的 scope，由项目的普通包管理器声明。需要跨项目复用时，所有者可以把同一个组件发布为有版本的 npm 或私有 Registry 包。使用方安装选定版本，并将 lockfile 与项目一起保存。

## 安装与 Source 导入

Skill、Hypit 安装和视频项目分别安装与更新。项目组件是普通项目依赖；所选本地服务可以通过 `hypit runtime up` 准备文件与进程。

Source 使用 `@your-studio/scoreboard@1` 这样的组件地址。项目包管理器选择安装版本，并把它记录在 lockfile 中；缺包时会报告需要安装的包名。

## 编写与分享扩展

在视频项目的 `packages/` 下创建组件，并用项目包管理器安装。包携带自己的代码、素材、README 与示例；所选 Hypit 版本的准确 TypeScript 入口由对应包 README 说明。

- [添加作者包](./author-packages.md)：从随发行包提供的可构建组件开始。
- [组件结构](./component-anatomy.md)：如何选择组件边界和公开输入。
- [模型与 Provider](./providers.md)：新模型、服务与凭据的选择。
- [Runtime](./runtime.md)：Endpoint 和凭据配置。

准确 API 与实现示例留在对应的已安装包 README 中。
