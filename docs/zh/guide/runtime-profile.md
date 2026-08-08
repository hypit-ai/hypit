---
title: Runtime Profile
description: 配置 Build 在哪里执行、诊断与 Build 归档。
---

# Runtime Profile

Runtime Profile 声明冻结后的 Build *在哪里*执行：Endpoint、凭据、并发、权限。它属于部署配置，而不是创作内容——它绝不进入 Author Graph 或 Run Graph 的身份。

支持两种形式：

| 形式 | 文件 | 适用场景 |
|---|---|---|
| 声明式 JSON | `svml.runtime.json` | 标准路径 |
| 可执行 TypeScript | `svml.runtime.ts` | 高级嵌入 API |

## 声明式 JSON

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.production",
      "lane": "generation",
      "config": {
        "apiKeyEnv": "KIE_API_KEY",
        "defaultConcurrency": 2
      }
    },
    {
      "use": "@narratage/provider-media-local",
      "instance": "media.local",
      "lane": "media",
      "config": { "defaultConcurrency": 2 }
    },
    {
      "use": "@narratage/provider-whisperx-local",
      "instance": "whisperx.local",
      "lane": "alignment",
      "config": { "defaultConcurrency": 1 }
    },
    {
      "use": "@narratage/provider-google-vertex",
      "instance": "vertex.local",
      "lane": "planning",
      "config": {
        "projectEnv": "GOOGLE_CLOUD_PROJECT",
        "credentialsEnv": "GOOGLE_APPLICATION_CREDENTIALS_JSON",
        "defaultConcurrency": 1
      }
    },
    {
      "use": "@narratage/provider-hyperframes-local",
      "instance": "hyperframes.local",
      "lane": "render",
      "config": { "workers": 2, "quality": "standard", "defaultConcurrency": 1 }
    }
  ],
  "permissions": [
    "filesystem:whisperx-staging",
    "network:aiplatform.googleapis.com",
    "network:api.kie.ai",
    "network:whisperx-loopback",
    "process:hyperframes",
    "process:media"
  ],
  "scheduling": {
    "maxConcurrency": 4,
    "lanes": {
      "generation": 2,
      "media": 2,
      "alignment": 1,
      "planning": 1,
      "render": 1
    }
  }
}
```

### Endpoint 字段

| 字段 | 含义 |
|---|---|
| `use` | 适配器名称，从 `runtimePackageLock` 解析 |
| `instance` | 该 Endpoint 实例的唯一标识 |
| `lane` | 管辖并发的调度 lane |
| `config` | 适配器专属配置（凭据环境变量、并发、超时） |

凭据通过环境变量名引用，绝不存放在 Profile 里。

### 调度

`maxConcurrency` 限制所有 lane 上并发 Operation 的总量。每个具名 lane 还有自己的子上限。lane 由 Endpoint 声明，并由 Scheduler 强制执行。

### 权限

每个权限字符串向已锁定的 Endpoint 授予一项具体权能：

- `network:<host>` — 到该主机的出站 HTTP
- `filesystem:<scope>` — 在具名作用域内的文件访问
- `process:<name>` — 本地进程执行

## 可执行 TypeScript

用于高级嵌入场景，以编程方式构造 Runtime：

```typescript
import { createProjectLocalRuntime } from "@narratage/local";
import { createKieProvider } from "@narratage/provider-kie";
import { createLocalMediaProvider } from "@narratage/provider-media-local";

export default async function createRuntime() {
  const endpoints = [
    createKieProvider({
      instance: "kie.prod",
      lane: "generation",
      defaultConcurrency: 2,
    }),
    createLocalMediaProvider({
      instance: "media.prod",
      lane: "media",
      defaultConcurrency: 2,
    }),
  ];

  return await createProjectLocalRuntime({
    root: import.meta.dirname,
    packageLock: "./svml.packages.lock",
    endpoints,
    allowedPermissions: endpoints.flatMap(e =>
      e.manifest.facets.flatMap(f => f.permissions)),
    scheduling: {
      maxConcurrency: 4,
      lanes: { generation: 2, media: 2 },
    },
  });
}
```

两种形式都可以传给 `--runtime`：

```bash
pnpm narratage build build.svrun --runtime ./svml.runtime.json
pnpm narratage build build.svrun --runtime ./svml.runtime.ts
```

## 诊断

### doctor

在不运行 Build、不发出付费请求的前提下检查 Runtime Profile：

```bash
pnpm narratage doctor svml.runtime.json
```

校验内容：
- 包锁文件存在且可读
- 适配器字节摘要匹配
- 配置键对各适配器有效
- 引用的凭据在环境中存在
- 找得到所需的可执行文件（ffmpeg、ffprobe、chrome）
- 声明的外部服务可达且与当前 Profile 匹配

Runtime Adapter Host ABI `@2` 把必需的纯配置校验与 Adapter 工厂彻底分开。`doctor`
不会构造 Endpoint 或 Store、启动服务、写入 Runtime 状态或提交任务。配置通过后，它可以执行
有边界的只读环境探测；同一实例的首个配置或前置条件错误会截断由它连带产生的重复诊断。

### gc（垃圾回收）

```bash
pnpm narratage gc svml.runtime.json            # dry-run
pnpm narratage gc svml.runtime.json --apply     # delete unreachable Artifacts
```

遍历每个保留的 BuildState 与 Operation，计算可达的 Artifact 摘要，并报告（或删除）不可达的孤儿对象。

## Build 归档与检视

每次 Build 都会持久归档全部已接受的 Record 与被引用的 Artifact，与任何 `--to` 目标路径无关。

### 列出 Build

```bash
pnpm narratage builds --runtime svml.runtime.json
```

### 检视

```bash
pnpm narratage inspect <build-id> --runtime svml.runtime.json
```

显示 target 绑定、被请求的 Logical Output、每个已接受的 Record 以及 Operation 状态。

### 取回 Record

```bash
# By source output name
pnpm narratage get <build-id> --runtime svml.runtime.json \
  --name final.video --to output.mp4

# By Record id
pnpm narratage get <build-id> --runtime svml.runtime.json \
  --record <record-id> --to output.json

# By Logical Output id
pnpm narratage get <build-id> --runtime svml.runtime.json \
  --output <output-id>

# By Artifact digest
pnpm narratage get <build-id> --runtime svml.runtime.json \
  --artifact <sha256:...> --to file.bin
```

`--name` 使用 Host-only Build Catalog 中的来源输出别名。Catalog 只是展示层的便利设施，不进入 Core 的 Build 身份。
