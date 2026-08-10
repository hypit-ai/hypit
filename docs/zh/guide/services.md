---
title: Runtime 与外部服务
description: 管理耐久 Worker 与 Profile 明确选择的本地程序。
---

# Runtime 与外部服务

这里有两个故意分开的生命周期。

## 整个执行域

```bash
pnpm narratage runtime up svml.runtime.json
pnpm narratage runtime status svml.runtime.json
pnpm narratage runtime logs svml.runtime.json
pnpm narratage runtime down svml.runtime.json
```

`runtime up` 启动或复用当前 Profile 的后台 Worker，并准备、启动该 Profile 声明的外部程序。
重复执行不会创建第二个同域 Worker。`runtime status` 同时展示 Worker、耐久队列、共享容量和
外部程序健康状态。

后台进程同时绑定 Profile 路径，以及覆盖 Profile 与两份 package lock 的有效修订摘要。
任一文件变化后，旧进程会显示为 `stale`；下一次 `runtime up` 或 `build` 会先替换旧进程，
不会让新 Dispatch 偷偷进入旧执行闭包。

`runtime down` 停止 Worker 和由该 Profile 管理的程序，但不会取消 Build 或远端 Provider
任务。队列仍在 Store 中，下次启动后继续。

## 只管理外部程序

```bash
pnpm narratage services up svml.runtime.json
pnpm narratage services status svml.runtime.json
pnpm narratage services down svml.runtime.json
```

`services` 是调试/运维命令，只处理 Adapter 声明的程序，不启动 Worker、不读取或修改 Build
队列。例如：

- 常驻的本地 WhisperX HTTP 服务；
- OpenCV Python 环境探测；
- HyperFrames 浏览器准备；
- ffmpeg/ffprobe 兼容性探测。

KIE 这种纯远端 API Endpoint 没有本地 service。

## 与 Build 的关系

`build` 会先验证并确保 Runtime 正在运行，然后耐久写入 Build 与 Dispatch ticket。无
`--follow` 时立刻退出；`--follow` 只观察。中断观察终端不会中断 Worker。

`--no-services` 只表示外部程序由部署者另行维护，不会把执行塞回 CLI，也不会恢复任何
隐式 Runtime 默认。

## 可见性

```bash
pnpm narratage queue --runtime svml.runtime.json --watch
pnpm narratage status <build-id> --runtime svml.runtime.json
pnpm narratage operations <build-id> --runtime svml.runtime.json
pnpm narratage operation <operation-id> --runtime svml.runtime.json
```

这些命令展示 dispatch phase、租约/容量、Operation checkpoint 和取消状态。`--json` 输出
一次结构化结果，watch 命令可用 `--jsonl`。

## WhisperX

`@narratage/provider-whisperx-local` 声明热服务及健康探测，锁定协议、包版本、模型、设备、
计算类型和 batch size。服务只读取允许目录下的规范证据 WAV。Runtime lane 避免无意义的
并发 `BUSY`。

开发服务本身时仍可前台运行：

```bash
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
uv run --project services/whisperx --frozen svml-whisperx-check
uv run --project services/whisperx --frozen svml-whisperx-service
```

## OpenCV、HyperFrames 与媒体工具

OpenCV Adapter 在没有显式外部 Python 时维护冻结环境；HyperFrames Adapter 维护自身浏览器。
二者都不是中央默认，只有被 Profile 选中的锁定 Adapter 才能贡献程序。

本地媒体 Endpoint 只接受通过能力探测的显式或系统 `ffmpeg`/`ffprobe`。Runtime 不会修改
Homebrew、apt 或其他系统包管理器。
