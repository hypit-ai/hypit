---
title: 添加 Provider
description: 添加新 Endpoint 适配器的分步指南。
---

# 添加 Provider

一个 Provider 包实现一项受控的外部能力——视频生成、媒体处理、对齐、字幕规划、渲染。它通过 Runtime Profile 激活，而不是通过 Author Source 里的 `<import>`。

不需要改动 Core、CLI 或任何作者包。

## 1. 创建包

```bash
mkdir -p packages/provider-my-service/src packages/provider-my-service/test
```

## 2. 编写 package.json

Provider 包依赖 Runtime 端口与共享能力词汇，不依赖精确模型包，也绝不依赖 CLI：

```json
{
  "name": "@narratage/provider-my-service",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "narratage": { "activation": "./src/activation.ts" },
  "dependencies": {
    "@narratage/endpoint-kit": "workspace:*",
    "@narratage/protocol": "workspace:*",
    "@narratage/runtime": "workspace:*",
    "@narratage/runtime-kit": "workspace:*",
    "@narratage/runtime-host-node": "workspace:*",
    "@narratage/generation": "workspace:*"
  }
}
```

## 3. 实现 Provider

Provider 处理来自 Scheduler 的 Command：提交请求、轮询、下载以及 ArtifactStore 持久化。

```typescript
// src/provider.ts
import { defineEndpointPackage } from "@narratage/endpoint-kit";

export function createMyServiceProvider(options: {
  instance: string;
  pool: string;
  apiKey: CredentialRef;
  defaultConcurrency?: number;
}) {
  return defineEndpointPackage({
    module: { name: "@narratage/provider-my-service", version: "1" },
    facet: "service",
    instance: options.instance,
    pool: options.pool,
    credentials: { apiKey: options.apiKey },
    defaultConcurrency: options.defaultConcurrency ?? 2,
    capabilities: [{
      capability: myCapability,
      returns: myResultType,
      lane: "generate",
      lifecycle: "recoverable",
      endpoint: myRecoverableEndpoint,
    }],
  });
}
```

可以参考现有的 Provider：
- `packages/provider-kie/src/provider.ts` — 带上传、轮询和下载的远程生成
- `packages/provider-media-local/` — 本地进程执行（ffprobe/ffmpeg）
- `packages/provider-whisperx-local/` — 本地 HTTP 服务
- `packages/provider-hyperframes-local/` — 本地 Chrome 渲染
- `packages/provider-hyperframes-aws-lambda/` — 可恢复的 Step Functions/Lambda 渲染
- `packages/provider-media-aws-lambda/` — 通过共享 ffmpeg 执行体完成同步 Lambda 媒体操作
- `packages/provider-xiaomi-mimo/` — 不依赖 MiMo 模型包的官方即时 TTS API

## 4. 编写 activation 描述符

```typescript
// src/activation.ts
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
} from "@narratage/runtime-kit";
import { createMyServiceProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-my-service",

  activate(context) {
    if (context.pool === undefined) throw new Error("MyService pool is required");
    const config = runtimeConfigObject(context.config, "MyService");
    runtimeConfigExact(config, ["apiKey", "defaultConcurrency"], "MyService");
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "MyService apiKey");
    if (apiKey === undefined) throw new Error("MyService apiKey CredentialRef is required");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "concurrency");
    return {
      endpoint: createMyServiceProvider({
        instance: context.instance,
        pool: context.pool,
        apiKey,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
      }),
    };
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [adapter],
};

export default narratagePackage;
```

`activate` 是唯一的纯部署声明。它返回的 Endpoint 同时拥有供 `doctor` 与执行使用的凭据引用、
capability 和调度事实。Activation 不得解析密钥或环境来源的部署值、访问网络或启动任务；环境变量名会作为引用保留到真正处理匹配 Need 时。凭据是否存在由通用 CredentialStore 路径诊断，
Provider 不得把环境变量硬编码成特殊的密钥 Store。

## 5. 按需声明 Managed Program

如果 Provider 依赖需要保持温热的外部程序，就在 Endpoint 旁边导出它的声明。这里没有第二个
manifest 开关，也没有中央 Program 注册表：

```typescript
// src/program.ts
import type { ManagedProgram } from "@narratage/runtime-kit";

export function createMyProgram(): ManagedProgram {
  return {
    id: "my-service",
    prepare: { command: "uv", args: ["sync", "--project", "services/my-service", "--frozen"] },
    start: { command: "uv", args: ["run", "--project", "services/my-service", "--frozen", "narratage-my-service"] },
    probe: async () => {
      // 返回 { state: "ready" } 或 { state: "down", detail: "..." }
    },
  };
}
```

在同一个 activation 中把它与 Endpoint 一起返回：

```typescript
const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-my-service",
  activate(context) {
    return {
      endpoint: createMyServiceProvider(/* 已解析配置 */),
      program: createMyProgram(),
    };
  },
});
```

`narratage runtime up` 会准备、启动并探测 Managed Program，然后启动耐久 Worker。`build` 只启动
本次 Plan 所需 Capability 对应的 Program。只调用远程 API 的 Provider 不返回 `program`。

## 6. 注册并锁定

在 Provider 自己的 `package.json` 中声明所有导入包：

```json
"dependencies": {
  "@narratage/runtime-kit": "workspace:*"
}
```

用项目的包管理器安装它。Runtime Profile 用 `use` 显式实例化之前，这个包始终不会运行。

## 7. 在 narratage.runtime.json 中引用

```json
{
  "endpoints": {
    "my-service": {
      "use": "@narratage/provider-my-service",
      "pool": "my-service.account",
      "config": {
        "apiKey": { "store": "keychain", "key": "my-service.api-key" },
        "defaultConcurrency": 2
      }
    }
  }
}
```

验证配置：

```bash
narratage doctor narratage.runtime.json
```

## 可供研究的现有 Provider

| 包 | 模式 |
|---|---|
| `provider-kie` | 远程 API：上传、付费提交、带检查点的轮询、有界下载、即时 ArtifactStore 持久化 |
| `provider-media-local` | 本地进程：不经 shell 的 ffprobe/ffmpeg，执行有界 |
| `provider-whisperx-local` | 本地 HTTP 服务：带热模型，单次准入并发 |
| `provider-google-vertex` | 云 API：带 project/credentials 配置的 Vertex AI |
| `provider-hyperframes-local` | 本地进程：Chrome 渲染，带 worker 并行与输出探测校验 |
| `provider-hyperframes-aws-lambda` | 远程可恢复任务：确定性 Step Functions 提交、轮询与 S3 流式落库 |
| `provider-image-opencv-local` | 本地 Python：有界的 OpenCV/NumPy，配合锁定的 Python 环境 |
| `provider-media-aws-lambda` | 远程同步 Lambda：与本地媒体相同的八项能力 |
| `provider-xiaomi-mimo` | 远程即时 API：把精确 MiMo TTS 请求落成持久化音频 Artifact |
