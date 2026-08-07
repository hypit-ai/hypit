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
| Python | 3.10–3.13 | WhisperX 与 OpenCV [sidecar 服务](./services.md) |
| uv | latest | Python 环境管理 |
| ffmpeg / ffprobe | 较新的稳定版 | 媒体处理 |
| Chrome / Chromium | 较新的稳定版 | HyperFrames 渲染 |

只有 Node.js 与 pnpm 是硬性要求。其余都只在跑真实 Builds 时才需要。

## 日常工作流

```bash
pnpm install          # 拉取代码或改动依赖之后
pnpm check            # TypeScript 类型检查：v1 + v2
pnpm test             # 完整测试套件：v1 + v2
```

| 命令 | 实际执行什么 |
|---|---|
| `pnpm check:v1` | `tsc -p tsconfig.json --noEmit` —— 保留下来的 v1 research oracle |
| `pnpm check:v2` | `tsc -p tsconfig.v2.json --noEmit` —— 全部 v2 workspace 包 |
| `pnpm test:v1` | `node --import tsx --test 'test/**/*.test.ts'` |
| `pnpm test:v2` | `node --import tsx --test 'packages/*/test/**/*.test.ts' 'tools/*.test.mjs'` |

关于受环境开关控制的测试与测试写法，参见 [Testing](./testing.md)。

## 仓库结构

```text
svml/
├── packages/              64 v2 workspace packages (the active system)
├── spec/                  7 normative specification documents
├── docs/                  VitePress documentation site
├── examples/              v2 examples and v1 regression fixtures
├── services/              Python sidecar services (whisperx, image-opencv)
├── src/                   v1 legacy source (regression evidence only)
├── stdlib/                v1 kernel definitions and runtime
├── test/                  v1 test suite
├── tools/                 boundary tests and build scripts
├── package.json           root workspace manifest
├── pnpm-workspace.yaml    workspace: [packages/*]
├── tsconfig.json          v1 TypeScript config
└── tsconfig.v2.json       v2 TypeScript config
```

`src/`、`stdlib/` 与 `test/` 是 v1 research oracle，作为回归证据保留下来。它们不是 v2 API。

## 指南目录

| 指南 | 主题 |
|---|---|
| [包架构](./packages.md) | 四个层次、依赖规则、包的构成、facets |
| [添加 Author 包](./author-packages.md) | 分步说明：新增组件、Surface、activation |
| [添加 Provider](./providers.md) | 分步说明：新增 Endpoint 适配器 |
| [Runtime Profile](./runtime-profile.md) | JSON 与 TypeScript 配置、诊断、Build 归档 |
| [本地服务](./services.md) | WhisperX 与 OpenCV sidecar 的搭建 |
| [测试](./testing.md) | 测试运行器、写法、示例、boundary tests |
| [代码规范](./conventions.md) | 命名、模块边界、wire 数据、TypeScript 配置 |
