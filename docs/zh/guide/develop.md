---
title: 开发指南
description: 开始 Hypit 开发工作。
---

## 前置条件

| 工具 | 版本 | 用于 |
|---|---|---|
| Node.js | 22.15+ | 所有工作 |
| pnpm | 10.33.x | workspace 管理；由根目录 `packageManager` 字段选择 |
| Python | 3.10–3.13 | 本地 WhisperX 与 OpenCV Managed Program |
| uv | latest | Python 环境管理 |
| ffmpeg / ffprobe | 较新的稳定版 | 媒体处理 |
| Chrome / Chromium | 由 `hypit runtime up` 下载 | 本地 HTML 光栅化 |

只有 Node.js 与 pnpm 是硬性要求。其余都只在跑真实 Builds 时才需要。

首次本地渲染前执行 `hypit programs up --runtime <profile> --endpoint <render-instance>`。
`hypit runtime up --runtime <profile>` 也会准备 Profile 的程序并启动 Worker。
这一步准备浏览器，不依赖 pnpm 放行依赖安装脚本。
使用 `hypit doctor --runtime <profile>` 检查缺失环境；诊断不会安装浏览器。

## 指南目录

| 指南 | 主题 |
|---|---|
| [与 Agent 一起制作视频](./skill.md) | 创作方向、服务选择与可编辑项目 |
| [包与扩展](./packages.md) | 组件、模型与服务的职责，安装与分享 |
| [添加 Author 包](./author-packages.md) | 分步说明：新增组件、Surface、词表与预览图、activation |
| [模型与 Provider](./providers.md) | 选择账户与 API，开发 Model 或 Provider 包 |
| [Runtime](./runtime.md) | Profile、Workspace、执行与生命周期边界 |
| [Studio 本地化](https://github.com/hypit-ai/hypit/blob/main/packages/studio/LOCALIZATION.md) | 翻译界面文案，加载本地 JSON 或已安装的语言包 |
| [代码规范](./conventions.md) | 命名、模块边界、wire 数据、TypeScript 配置 |
