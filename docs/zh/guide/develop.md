---
title: 开发指南
description: 开始 Narratage 开发工作。
---

# 开发指南

## 前置条件

| 工具 | 版本 | 用于 |
|---|---|---|
| Node.js | 22+ | 所有工作 |
| pnpm | 9+ | workspace 管理 |
| Python | 3.10–3.13 | WhisperX 与 OpenCV [本地服务](./services.md) |
| uv | latest | Python 环境管理 |
| ffmpeg / ffprobe | 较新的稳定版 | 媒体处理 |
| Chrome / Chromium | 较新的稳定版 | HyperFrames 渲染 |

只有 Node.js 与 pnpm 是硬性要求。其余都只在跑真实 Builds 时才需要。

## 日常工作流

```bash
pnpm install          # 拉取代码或改动依赖之后
pnpm check            # TypeScript 类型检查
pnpm test             # 完整测试套件
```

| 命令 | 实际执行什么 |
|---|---|
| `pnpm check` | `tsc -p tsconfig.json --noEmit` |
| `pnpm test` | 通过 Node test runner 运行 package、service-adapter 与仓库边界测试 |

关于受环境开关控制的测试与测试写法，参见[测试](./testing.md)。

## 仓库结构

```text
narratage/
├── packages/              82 workspace packages
├── spec/                  16 normative specification documents
├── docs/                  VitePress documentation site
├── examples/              runnable example sources
├── services/              Python 服务 (whisperx, image-opencv)
├── tools/                 boundary tests and build scripts
├── package.json           root workspace manifest
├── pnpm-workspace.yaml    workspace: [packages/*]
└── tsconfig.json          TypeScript config
```

## 指南目录

| 指南 | 主题 |
|---|---|
| [包架构](./packages.md) | 五个层次、依赖规则、包的构成、facets |
| [添加 Author 包](./author-packages.md) | 分步说明：新增组件、Surface、activation |
| [添加 Provider](./providers.md) | 分步说明：新增 Endpoint 适配器 |
| [Runtime Profile](./runtime-profile.md) | JSON 与 TypeScript 配置、诊断、Build 归档 |
| [本地服务](./services.md) | WhisperX 与 OpenCV 的搭建 |
| [测试](./testing.md) | 测试运行器、写法、示例、boundary tests |
| [代码规范](./conventions.md) | 命名、模块边界、wire 数据、TypeScript 配置 |
