---
title: Runtime Profile
description: 显式配置 Build 的执行环境、状态存储、凭据与并发。
---

# Runtime Profile

Runtime Profile 声明冻结后的 Build *在哪里*执行：Scheduler、Worker、全部 Store、Endpoint、凭据和并发。它属于部署配置，绝不进入 Author Graph 或 Run Graph 身份。

每个项目只需选择一次：

```bash
narratage runtime use svml.runtime.json
```

CLI 只在 `.svml/runtime` 保存一个相对路径指针。Profile 仍然唯一决定项目根、两份 package
lock、Store、Endpoint 与调度。`runtime unset` 只删除该指针，不停止任务、不删除状态；
`--runtime <profile>` 则是单次命令覆盖。

## 声明式 Profile

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtimeServices": [
    { "use": "@narratage/local", "instance": "execution" },
    { "use": "@narratage/store-sqlite", "instance": "state", "config": { "path": ".svml/runtime.sqlite" } },
    { "use": "@narratage/artifact-store-fs", "instance": "artifacts", "config": { "path": ".svml/artifacts" } },
    { "use": "@narratage/credential-store-keychain", "instance": "credentials.keychain", "config": { "service": "narratage" } }
  ],
  "services": {
    "scheduler": "execution.scheduler",
    "worker": "execution.worker",
    "stores": {
      "build": "state.builds",
      "operations": "state.operations",
      "dispatch": "state.dispatch",
      "artifacts": "artifacts",
      "credentials": ["credentials.keychain"]
    }
  },
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.production",
      "config": {
        "apiKey": { "store": "keychain", "key": "kie.api-key" },
        "defaultConcurrency": 2
      }
    }
  ],
  "scheduling": { "maxConcurrency": 4 }
}
```

`runtimeServices` 激活已安装的实现；`services` 按实例 id 逐项选择 Scheduler、Worker、
BuildStore、OperationStore、DispatchStore、ArtifactStore 和一个或多个
CredentialStore。不存在“因为只装了一个所以自动选中”，`@narratage/local` 也不补 SQLite、文件系统或凭据默认值。

凭据只写地址：`{ "store": "…", "key": "…" }`，秘密字节不进 Profile。多个 Store 可以并存，每个 Store 只响应属于自己命名空间的引用。

## 文件边界

| 字段 | 含义 |
|---|---|
| `root` | 项目根；既约束 Source，也承载 Runtime 数据、Artifact 与相对 lock；默认是 Profile 所在目录 |
| `packageRoot` | 提供已安装 `node_modules` 的 Host 位置；与项目数据目录无关 |
| `packageLock` | 可信 Author/Run 实现包库存；每次编译只激活当前 Source 的精确子集 |
| `runtimePackageLock` | 可信 Runtime Adapter 包库存；每份 Profile 只激活自己显式选择的 Adapter |

外部项目可以把源文件、锁、SQLite 和 Artifact 全部留在自己的目录，同时从另一个
Narratage 安装目录加载校验后的包。

## 并发与信任边界

`maxConcurrency`、每个 Provider 的总 Authority 上限与其内部实际模型/API route 上限，由 DispatchStore 在所有共享 Worker 之间执行。一次任务原子领取 Provider 与 route 两份容量，不会在父子队列间复制。Route 是 Provider 本地概念；KIE Seedance 与另一个 Provider 的 Seedance 不共享隐藏的家族计数器。容量租约跟随 Build 的 fenced lease；过期 Worker 不能继续准入结果。

Runtime Adapter 当前是可信本地代码。开放任意第三方 Adapter 之前，需要真正的进程或 Wasm
隔离；字符串 allowlist 不能限制同一 Node 进程里的代码。

## 凭据控制不是 Runtime 执行

`auth status|login|logout <endpoint-instance>` 只构造该 Endpoint 的声明和 Profile 明确选择的
CredentialStore，不会打开 SQLite、启动 Worker、加载作者包或构造其他 Provider。因此登录
KIE 不会被旧 Build 数据库或无关的 Vertex 配置拦住。

## 生命周期

```bash
node --run narratage -- doctor
node --run narratage -- runtime up
node --run narratage -- runtime status
node --run narratage -- runtime logs
node --run narratage -- runtime down
```

`runtime up` 管理耐久 Worker 与声明的外部程序。`services up/status/down` 只管理外部程序，不会启动 Worker。`build` 会确保 Runtime 已启动，但 Build 所在终端从不拥有执行权。Distribution 提供一个不透明 Runtime 修订；官方 JSON Profile 让它覆盖 Profile 与两份 package lock，通用 CLI 不解释其语法。任一文件变化后状态变为
`stale`，下一次启动或提交会按新执行闭包替换进程，而不是继续复用旧装配。

`doctor` 会求值 Endpoint Adapter 唯一的纯 `activate()` 声明，并直接从产生的 Endpoint package
读取凭据和前置条件；不存在另一份仅供诊断使用的凭据镜像。Activation 可以构造 handler，但不得解析密钥、访问网络、启动进程或修改持久状态。`doctor` 不构造 Scheduler、Worker、Build
Store 或作者包，不会启动服务、写入 Runtime 状态或提交任务；它只打开 Profile 明确选择的
CredentialStore 来解析引用，完成后立即关闭，并可执行显式声明的有界只读探测。

预发布阶段不会原地迁移 SQLite 执行 schema。遇到更早的开发数据库时，CLI 会指出精确路径，要求把数据库连同 WAL 文件归档，或在 Profile 选择新路径。ArtifactStore 是独立选择的；该拒绝不会删除任何产物字节。

## Build、队列与归档

```bash
node --run narratage -- build build.svrun
node --run narratage -- build build.svrun --follow
node --run narratage -- queue --watch
node --run narratage -- status <build-id>
node --run narratage -- inspect <build-id>
node --run narratage -- get <build-id> --name final.video --to output.mp4
```

不带 `--follow` 时，`build` 在耐久提交后退出；Worker 继续执行。`--follow` 只是观察，Ctrl-C
不会取消任务。所有已接受 Record 与引用的 Artifact 都会归档，`get` 只是可选导出。

## 取消

```bash
node --run narratage -- cancel <build-id>
```

CLI 唯一控制单位是 Build。尚未被 Worker 领取的排队 Build 会在 Store 中原子撤回；已经运行的 Build 会先关闭后续准入，再尽力取消已提交的 Provider 工作。`accepted` 只是远端接受停止请求，不等于已经停止；系统继续协调到 `confirmed`、`unsupported`、`too-late` 或自然结束。Operation 仍会作为 Build 详情显示，但不能被 CLI 单独控制。终态 Build 不会重新打开；再次运行同一 `.svrun` 会创建新 Build。Endpoint 的 checkpoint 恢复只用于 Worker 重启后续接同一个已提交外部任务，避免重复付费。

## 嵌入 API

官方 video Distribution 目前按 JSON 解析声明式 Runtime Profile；通用 CLI 不给 `.json`
后缀任何语义，只把文档交给 Distribution。嵌入 Narratage 的应用可以通过
`@narratage/local` 直接组装相同的 Runtime 角色。
