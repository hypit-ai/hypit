---
title: 包与扩展
description: 视频项目如何通过普通包选择组件、模型和服务。
---

# 包与扩展

Hypit 把视频需要什么，与哪些代码和服务完成它，分别表达。新的图形、模型或 API 来源可以由包提供，再由项目选择。每个包拥有自己的接口和实现，执行系统负责运行它们组成的依赖图。

## 各部分的职责

| 部分 | 职责 | 在哪里选择 |
| --- | --- | --- |
| 作者组件 | 将作者输入转成素材请求、视觉行为或其他图输出 | Source 导入 |
| Model | 定义明确的生成请求与输出 | Source 导入 |
| Provider Endpoint | 通过 API 或本地工具执行支持的请求 | Runtime Profile |
| 凭据存储 | 为 Endpoint 解析具名凭据 | Runtime Profile |
| Result 仓库 | 保留项目的 Build 记录与产物文件 | 项目 Result 配置 |
| Distribution | 提供可执行应用与官方包 | 安装的 `hypit` 版本 |

例如，Model 描述要生成的视频，Provider 将请求映射到服务；Ranking 组件描述榜单的行为，渲染器将其贡献绘制到最终编排。两者都通过明确输入与输出参与同一个图。

## 组件随作品需要组织

在适合提取秩序的地方组织空间。Media Track 可以呈现普通视频或图片；项目组件可以把移动的视频视口、标签和流程图作为一个场景协调起来。独立字幕或叠加层仍可分开。共享行为决定哪些内容属于同一个组件。

对于说话视频，Script Selection 与 Moment 让组件跟随表演的含义；作者主导节奏的动画，则可以在声明的时钟上使用秒或帧。[Film 与渲染](../quickstart/composition.md) 介绍这些贡献如何组成作品。

新组件通常放在视频项目的 `packages/` 中，使用所有者自己的 scope，由项目的普通包管理器声明。需要跨项目复用时，所有者可以把同一个组件发布为有版本的 npm 或私有 Registry 包。使用方安装选定版本，并将 lockfile 与项目一起保存。

## 安装与 Source 导入

Skill、可执行 Distribution 和视频项目分别安装与更新。`hypit` Distribution 包含官方作者包和公开扩展 API。所选 Runtime Adapter 可以通过 `hypit runtime up` 准备额外服务依赖；可选作者素材可以按 CLI 给出的准确 `hypit packages install` 命令安装。项目组件自己的依赖由项目管理。

Source 使用 `@your-studio/scoreboard@1` 这样的逻辑 Module 地址。npm 安装的包版本决定实际实现，逻辑 `@1` 标识作者接口。视频 Build 使用这些已安装的版本；缺包时会报告安装所需的信息。

## 编写与分享扩展

外部包使用 `hypit/author-kit`、`hypit/composition`、`hypit/model-kit` 或 `hypit/endpoint-kit` 等公开子路径。将选定的 `hypit` 版本作为开发依赖，把扩展编译为 JavaScript，分发它自己的代码与素材。`package.json` 中的 activation 入口描述它提供的能力；加载选中的扩展时，当前 Distribution 提供公开 Hypit API。

- [添加作者包](./author-packages.md)：从随发行包提供的可构建组件开始。
- [组件结构](./component-anatomy.md)：组件内部各部分的职责。
- [模型与 Provider](./providers.md)：新模型、服务与凭据的选择。
- [Runtime](./runtime.md)：Endpoint 和凭据配置。

精确 SDK 类型与实现示例留在对应包的 README 和源码中，它们也随 Distribution 分发。
