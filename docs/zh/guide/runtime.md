---
title: Runtime
description: Hypit Source 与 Core 之外的执行边界。
---

# Runtime

Hypit 把三个决定分开：

| 所有者 | 决定什么 |
|---|---|
| Workspace | 编译能读取哪些 Source 和本地素材 |
| Runtime Profile | 允许使用哪些环境包 |
| Local Runtime | Build 如何排队、执行、保存和被观察 |

Core 是领域无关的状态机。它接收事实、派生 Command、验证 Record，不启动进程、不读取凭证、
不选择 Provider，也不知道 Build 最终是不是视频。

`@hypit/runtime-local` 是默认执行环境。它自己拥有 Worker、调度器、Build 队列和 SQLite。
这些是同一个本地实现，不再伪装成需要用户逐项选择的组件。

## Runtime Profile

Profile 只保留真正会随环境变化的选择：

```json
{
  "format": "hypit.runtime-profile@1",
  "runtime": {
    "use": "@hypit/runtime-local",
    "config": {
      "dataRoot": ".hypit/runtimes/local",
      "artifacts": {
        "use": "@hypit/artifact-store-fs",
        "config": { "path": "artifacts" }
      },
      "credentials": {
        "env": { "use": "@hypit/credential-store-env" }
      },
      "endpoints": {
        "media": { "use": "@hypit/provider-media-local" }
      }
    }
  }
}
```

`artifacts` 决定产物字节放在哪里；`credentials` 选择凭证存储；`endpoints` 选择明确的
Provider 实现。

安装包只增加一种可选实现，不会自动激活。Profile 不包含 Workspace、作者 import 或隐藏的
创作路由。

## 本地状态

选择 Profile 会写入项目指针，执行数据位于 `dataRoot`：

```text
.hypit/
  runtime
  runtimes/
    local/
      runtime.sqlite
      artifacts/
      worker/
      programs/
```

`check` 和 `plan` 不创建 Runtime 数据。SQLite 保存 Build 事实、Operation 与队列；产物字节进入
Artifact Store；密钥只留在 Credential Store。

Workspace 独立由显式 `--workspace`、Runtime 指针所在项目或入口 Source 目录确定。Runtime 配置
不能扩大源码读取范围。

## 队列与并发

`build` 保存一个全新 Build 后立即返回。Worker 推进所有可运行的 Build，Core 保留每个
Build 的图依赖。Endpoint 包声明 Provider 与 capability 上限，因此不同 Build 的工作共享真正
执行它们的外部容量。

取消是尽力而为：未开始的工作直接撤回；运行中的 Build 不再接收新 Command，Endpoint 可以尝试
取消已经提交的外部 Operation。已经完成的产物永远保留，不做回滚。

## Managed Programs

Endpoint 可以声明 WhisperX 这类需要常驻的辅助程序。Endpoint 提供探测和可选启动命令，本地
Runtime 只负责管理它。

```bash
hypit programs status
hypit programs up
hypit programs down
```

`programs up` 会先准备所选 Endpoint 包的上游 npm 依赖，再操作其声明的程序。这些命令不打开
SQLite、Artifact Store 或 Credential Store。

## 生命周期

```bash
hypit runtime use hypit.runtime.json
hypit runtime up
hypit runtime status
hypit runtime logs
hypit runtime down
```

`runtime up` 先让 npm 把所选 Adapter 的精确上游包准备到机器共享目录，再准备 Managed
Program 并启动本地 Worker。`build` 不做部署：它执行便宜只读预检，只在就绪后提交，并确保
Worker 可用。`status`、`queue`、`cancel` 用来观察和控制耐久工作。终态 Build 不恢复；复用
以前的结果必须在新的 `.svrun` 中显式写 Candidate。

运行中的 Worker 会在 Build 第一次需要某个已安装 Component 包时加载它。后续 Build 可以在
不重启 Worker 的情况下新增 Component 包；Worker 会沿完整依赖闭包只加载尚未见过的部分。
已经加载的包代码不会热更新，因此修改包代码或更新 Distribution 后，仍需等 Worker 空闲再将
其停止，然后提交下一次 Build。

Runtime 包是本地可信部署代码，其安装版本由 npm 或 pnpm 管理。Hypit 只在显式 `runtime up` /
`packages install` 边界选择精确依赖并调用 npm，不维护第二份包锁，也不会把元数据冒充成沙箱。
