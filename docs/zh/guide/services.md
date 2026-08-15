---
title: Runtime 与外部服务
description: 管理耐久 Worker 与 Profile 明确选择的本地程序。
---

# Runtime 与外部服务

这里有两个故意分开的生命周期。

## 整个执行域

```bash
node --run narratage -- runtime use svml.runtime.json
node --run narratage -- runtime up
node --run narratage -- runtime status
node --run narratage -- runtime logs
node --run narratage -- runtime down
```

`runtime up` 启动或复用当前 Profile 的后台 Worker，并准备、启动该 Profile 声明的外部程序。重复执行不会创建第二个同域 Worker。`runtime status` 同时展示 Worker、耐久队列、共享容量和外部程序健康状态。

彼此独立的外部程序会并行准备。人类可读输出会显示 `Checking`、`Preparing`、`Starting`、
`Waiting`、`Ready`，首次准备 WhisperX 模型或浏览器时不会像命令卡死；JSON 模式仍只输出一份干净的最终文档。

后台进程同时绑定 Profile 路径与 Distribution 提供的不透明修订值。官方 JSON Profile 的实现让该修订覆盖 Profile 与两份 package lock；通用 CLI 不解析配置文档，也不假定哪些文件属于修订。任一文件变化后，官方 Worker 会显示为 `stale`；下一次 `runtime up` 或 `build` 会先替换旧进程，不会让新 Dispatch 偷偷进入旧执行闭包。

`runtime down` 只停止 Worker，并故意保留外部程序，因为其他 Runtime Profile 可能正在共用
它们。只有确实要停止这些程序时才执行 `services down`。两条命令都不会取消 Build 或远端
Provider 任务，队列仍在 Store 中，下次启动后继续。

## 只管理外部程序

```bash
node --run narratage -- services up svml.runtime.json
node --run narratage -- services status svml.runtime.json
node --run narratage -- services down svml.runtime.json
```

`services` 是调试/运维命令，只处理 Adapter 声明的程序，不启动 Worker、不读取或修改 Build
队列。例如：

- 常驻的本地 WhisperX HTTP 服务；
- OpenCV Python 环境探测；
- HyperFrames 浏览器准备；
- ffmpeg/ffprobe 兼容性探测。

KIE 这种纯远端 API Endpoint 没有本地 service。

## 与 Build 的关系

`build` 会先从选中 Producer steps 推导其声明的 capability，只准备承载这些 capability 的外部程序。纯文本或纯 Estimate Target 不会仅仅因为 Profile 里也提供 WhisperX 就加载几 GB
模型；这不改变图、不替作者路由 Provider，只避免启动无关部署程序。之后 Build 与 Dispatch
ticket 会被耐久写入。无 `--follow` 时立刻退出；`--follow` 只观察，并在 Build phase 或
Operation 数量变化时输出一行。中断观察终端不会中断 Worker。

`--no-services` 只表示外部程序由部署者另行维护，不会把执行塞回 CLI，也不会恢复任何隐式 Runtime 默认。

显式 `runtime up` 与 `services up` 仍管理整个 Profile，因为它们的对象是部署而非某次 Build。

## 可见性

```bash
node --run narratage -- queue --watch
node --run narratage -- status <build-id>
node --run narratage -- inspect <build-id>
node --run narratage -- cancel <build-id>
```

这些命令展示活跃 dispatch、Worker 状态、租约/容量、Operation 的通用进度、checkpoint 和取消状态。并发启动按 Profile 串行化，只会复用一个 Worker 和每个受管外部服务的一个实例；
`--follow` 若发现 Worker 已停止会明确报出重启命令，不会无限等待。`--json` 输出一次结构化结果，watch 命令可用 `--jsonl`。`queue --watch` 只输出第一份快照和后续变化，不会在远端任务状态没变时每秒重复刷同一个块。

CLI 的公开控制单位只有 Build。未被 Worker 领取的排队 Build 会被原子撤回；已运行的 Build
会关闭后续准入并协调已经提交的 Provider 工作。Operation 仍显示在 Build 详情中，但不能单独控制。终态 Build 不会重新打开；再次运行同一 `.svrun` 会创建新 Build。Endpoint checkpoint 只用于 Worker 重启后续接同一个已提交的外部任务，避免重复付费。

## WhisperX

`@narratage/provider-whisperx-local` 声明热服务及健康探测，锁定协议、包版本、模型、设备、计算类型和 batch size。服务只读取允许目录下的规范证据 WAV。Runtime Route 资源避免无意义的并发 `BUSY`。

开发服务本身时仍可前台运行：

```bash
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
uv run --project services/whisperx --frozen svml-whisperx-check
uv run --project services/whisperx --frozen svml-whisperx-service
```

## OpenCV、HyperFrames 与媒体工具

OpenCV Adapter 在没有显式外部 Python 时维护冻结环境；HyperFrames Adapter 维护自身浏览器。二者都不是中央默认，只有被 Profile 选中的锁定 Adapter 才能贡献程序。

本地媒体 Endpoint 只接受通过能力探测的显式或系统 `ffmpeg`/`ffprobe`。Runtime 不会修改
Homebrew、apt 或其他系统包管理器。
