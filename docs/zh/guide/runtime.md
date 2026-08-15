---
title: Runtime
description: Narratage Source 与 Core 之外的执行边界。
---

# Runtime

Narratage 把三个决定分开：

| 所有者 | 决定什么 |
|---|---|
| Workspace | 一次编译能读取哪些 Source 和本地素材 |
| Runtime Profile | 编译完成的 Build 交给哪个执行环境 |
| Runtime | Build 如何排队、执行、存储和被观察 |

Runtime Profile 不定义 Workspace。同一 Profile 可以服务多个项目，同一项目也可以在不改
Author Source 的情况下选择不同 Runtime。

## 边界

Core 是领域无关的状态机。它接收事实、派生 Command、验证 Record，不启动进程、不读取凭证、
不选择 Provider，也不知道 Build 最终是不是视频。

Runtime 接收已经编译完成的 Build，负责耐久状态、队列、租约、并发、Artifact、凭证、Endpoint、
Provider 调用和可选的长期运行程序。通用 CLI 只通过 Runtime Controller 与它通信，不假设它是
本地 Node 进程。本地 Controller 可以管理独立 Worker；远程 Controller 可以通过 HTTP 接收同一份 Build。

## Runtime Profile

Profile 选择一个 Runtime 包，并把封闭配置交给它：

```json
{
  "format": "narratage.runtime-profile@1",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtime": {
    "use": "@narratage/local",
    "config": {
      "dataRoot": ".narratage/runtimes/local",
      "components": {
        "execution": { "use": "@narratage/local" },
        "state": { "use": "@narratage/store-sqlite", "config": { "path": "state.sqlite" } },
        "artifacts": { "use": "@narratage/artifact-store-fs", "config": { "path": "artifacts" } }
      },
      "bindings": {
        "scheduler": "execution.scheduler",
        "worker": "execution.worker",
        "stores": {
          "build": "state.builds",
          "operations": "state.operations",
          "dispatch": "state.dispatch",
          "artifacts": "artifacts",
          "credentials": []
        }
      },
      "endpoints": {
        "media": { "use": "@narratage/provider-media-local" }
      },
      "limits": { "maxOperations": 4 }
    }
  }
}
```

`components` 配置可替换的 Runtime 基础设施，`bindings` 选择每个角色的确切实例，`endpoints`
配置能力实现，`limits` 限制整个 Runtime。安装包只增加可用实现，不会自动激活或改变 Core。

Profile 不包含 Source Workspace、Source package lock 或 Author 包选择。相对 Profile 路径从
Profile 文件解析；本地 Runtime 的私有路径从 `dataRoot` 解析。

## 项目状态与路径

```text
.narratage/
  runtime
  runtimes/
    local/
      worker/
      state.sqlite
      artifacts/
```

`runtime use` 只写 `.narratage/runtime` 指针，不启动进程。`check` 和 `plan` 不创建 Runtime 数据。
`narratage paths` 会报告 Workspace、项目状态、Runtime 数据与操作系统级 Host 状态的位置。

Workspace 独立按以下顺序确定：显式 `--workspace`、所选 `.narratage/runtime` 所在项目、最近的
Source package lock、入口 Source 目录。Runtime Profile 无权扩大它。

## Component、Endpoint 与 Managed Program

Runtime Component 是 Scheduler、Worker、Store 等基础设施实现。Binding 明确选择一个实例，包的
存在本身不具备路由权。Endpoint 实现声明过的 Capability，并负责 Provider 调用。

Managed Program 是 Endpoint 声明的长期外部进程，例如常驻 WhisperX 服务。它不是 Component，
也不是队列。Endpoint 可以声明探测、准备和启动方法；外部托管时只声明探测。

```bash
narratage programs status
narratage programs up
narratage programs down
```

Build 只准备本次所需能力对应的 Program。显式 `programs up` 检查完整 Profile；停止 Runtime
Worker 不会自动停止可能被共享的 Program。

## 生命周期

```bash
narratage runtime use svml.runtime.json
narratage runtime up
narratage runtime status
narratage runtime logs
narratage runtime down
```

这些都是 Controller 操作。`build` 每次提交一个新的 Build id；`--follow` 只负责观察。终态 Build
不会重新打开，复用已有结果必须由新的 Run Source Candidate 显式表达。

Source 包和 Runtime 包使用不同锁，因为它们拥有不同权限。目前 Node Runtime 包仍是可信部署代码；
在真正的进程或 Wasm 隔离完成前，Manifest 和 digest 都不能充当沙箱。
