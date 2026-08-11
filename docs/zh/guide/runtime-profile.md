---
title: Runtime Profile
description: 显式配置 Build 的执行环境、状态存储、凭据与并发。
---

# Runtime Profile

Runtime Profile 声明冻结后的 Build *在哪里*执行：Scheduler、Worker、全部 Store、Endpoint、
凭据、并发和权限。它属于部署配置，绝不进入 Author Graph 或 Run Graph 身份。

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
      "journal": "state.journal",
      "artifacts": "artifacts",
      "credentials": ["credentials.keychain"]
    }
  },
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.production",
      "lane": "generation",
      "config": {
        "apiKey": { "store": "keychain", "key": "kie.api-key" },
        "defaultConcurrency": 2
      }
    }
  ],
  "permissions": [
    "filesystem:artifacts",
    "filesystem:state",
    "process:keychain",
    "network:api.kie.ai",
    "network:kieai.redpandaai.co"
  ],
  "scheduling": {
    "maxConcurrency": 4,
    "lanes": { "generation": 2 }
  }
}
```

`runtimeServices` 激活已安装的实现；`services` 按实例 id 逐项选择 Scheduler、Worker、
BuildStore、OperationStore、DispatchStore、RuntimeJournal、ArtifactStore 和一个或多个
CredentialStore。不存在“因为只装了一个所以自动选中”，`@narratage/local` 也不补 SQLite、
文件系统或凭据默认值。

凭据只写地址：`{ "store": "…", "key": "…" }`，秘密字节不进 Profile。多个 Store 可以
并存，每个 Store 只响应属于自己命名空间的引用。

## 文件边界

| 字段 | 含义 |
|---|---|
| `root` | Runtime 数据与相对 lock 的根目录；默认是 Profile 所在目录 |
| `packageRoot` | 提供已安装 `node_modules` 的 Host 位置；与项目数据目录无关 |
| `packageLock` | 确定性 Producer/Validator 包闭包 |
| `runtimePackageLock` | 有权限的 Runtime Adapter 包闭包 |

外部项目可以把源文件、锁、SQLite 和 Artifact 全部留在自己的目录，同时从另一个
Narratage 安装目录加载校验后的包。

## 并发与权限

`maxConcurrency` 和每个 lane 的上限由 DispatchStore 在所有共享 Worker 之间执行，不是某个
CLI 进程里的计数器。容量租约跟随 Build 的 fenced lease；过期 Worker 不能继续准入结果。

权限仍是显式 allowlist，例如 `network:<host>`、`filesystem:<scope>`、`process:<name>`。

## 凭据控制不是 Runtime 执行

`auth status|login|logout <endpoint-instance>` 只构造该 Endpoint 的声明和 Profile 明确选择的
CredentialStore，不会打开 SQLite、启动 Worker、加载作者包或构造其他 Provider。因此登录
KIE 不会被旧 Build 数据库或无关的 Vertex 配置拦住。

## 生命周期

```bash
node --run narratage -- doctor svml.runtime.json
node --run narratage -- runtime up svml.runtime.json
node --run narratage -- runtime status svml.runtime.json
node --run narratage -- runtime logs svml.runtime.json
node --run narratage -- runtime down svml.runtime.json
```

`runtime up` 管理耐久 Worker 与声明的外部程序。`services up/status/down` 只管理外部程序，
不会启动 Worker。`build` 会确保 Runtime 已启动，但 Build 所在终端从不拥有执行权。
后台进程绑定覆盖 Profile 与两份 package lock 的有效修订摘要；任一文件变化后状态变为
`stale`，下一次启动或提交会按新执行闭包替换进程，而不是继续复用旧装配。

`doctor` 会求值 Endpoint Adapter 唯一的纯 `activate()` 声明，并直接从产生的 Endpoint package
读取凭据、权限和前置条件；不存在另一份仅供诊断使用的凭据镜像。Activation 可以构造 handler，
但不得解析密钥、访问网络、启动进程或修改持久状态。`doctor` 不构造 Scheduler、Worker、Build
Store 或作者包，不会启动服务、写入 Runtime 状态或提交任务；它只打开 Profile 明确选择的
CredentialStore 来解析引用，完成后立即关闭，并可执行显式声明的有界只读探测。

预发布阶段不会原地迁移 SQLite 执行 schema。遇到更早的开发数据库时，CLI 会指出精确路径，
要求把数据库连同 WAL 文件归档，或在 Profile 选择新路径。ArtifactStore 是独立选择的；该
拒绝不会删除任何产物字节。

## Build、队列与归档

```bash
node --run narratage -- build build.svrun --runtime svml.runtime.json
node --run narratage -- build build.svrun --runtime svml.runtime.json --follow
node --run narratage -- queue --runtime svml.runtime.json --watch
node --run narratage -- status <build-id> --runtime svml.runtime.json
node --run narratage -- operations <build-id> --runtime svml.runtime.json
node --run narratage -- operation <operation-id> --runtime svml.runtime.json
node --run narratage -- inspect <build-id> --runtime svml.runtime.json
node --run narratage -- get <build-id> --runtime svml.runtime.json --name final.video --to output.mp4
```

不带 `--follow` 时，`build` 在耐久提交后退出；Worker 继续执行。`--follow` 只是观察，Ctrl-C
不会取消任务。所有已接受 Record 与引用的 Artifact 都会归档，`get` 只是可选导出。

## 取消

```bash
node --run narratage -- cancel build <build-id> --runtime svml.runtime.json
node --run narratage -- cancel operation <operation-id> --runtime svml.runtime.json
```

Build 取消先关闭准入；Operation 取消只抑制那个精确实现。`accepted` 只是远端接受停止请求，
不等于已停止；系统继续协调到 `confirmed`、`unsupported`、`too-late` 或自然结束。迟到的付费
产物继续归档，但不能进入被抑制的 Core 分支。Runtime 不会因此偷偷换 Candidate 或 Provider。

## 高级 TypeScript 嵌入

`svml.runtime.ts` 仍可用于可信的私有部署代码，但必须构造与选择同样完整的一组 Runtime
service package。它不是作者语言逃生口，也没有隐藏默认值。仓库中的
`examples/talking-film-live/svml.runtime.ts` 是可执行参考。
