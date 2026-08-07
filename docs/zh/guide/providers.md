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

Provider 包依赖 Runtime 端口以及它所服务的模型族，绝不依赖 CLI：

```json
{
  "name": "@narratage/provider-my-service",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "svml": { "activation": "./src/activation.ts" },
  "dependencies": {
    "@narratage/endpoint-kit": "workspace:*",
    "@narratage/protocol": "workspace:*",
    "@narratage/runtime": "workspace:*",
    "@narratage/runtime-adapter": "workspace:*",
    "@narratage/runtime-adapter-node": "workspace:*",
    "@narratage/seedance": "workspace:*"
  }
}
```

## 3. 实现 Provider

Provider 处理来自 Scheduler 的 Command：提交请求、轮询、下载以及 ArtifactStore 持久化。

```typescript
// src/provider.ts
import type { EndpointManifest } from "@narratage/endpoint-kit";

export function createMyServiceProvider(options: {
  instance: string;
  lane?: string;
  apiKey?: { env: string };
  defaultConcurrency?: number;
}) {
  // 返回一个包含以下内容的对象：
  // - manifest：声明该 Endpoint 实现的 Capability
  // - handle：处理来自 Scheduler 的 Command
  // - close：清理
}
```

可以参考现有的 Provider：
- `packages/provider-kie/src/provider.ts` — 带上传、轮询和下载的远程生成
- `packages/provider-media-local/` — 本地进程执行（ffprobe/ffmpeg）
- `packages/provider-whisperx-local/` — 本地 sidecar HTTP 服务
- `packages/provider-hyperframes-local/` — 本地 Chrome 渲染

## 4. 编写 activation 描述符

```typescript
// src/activation.ts
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigObject,
  runtimeConfigString,
  runtimeConfigPositiveInteger,
} from "@narratage/runtime-adapter";
import { diagnoseRuntimeEnvironmentCredential } from "@narratage/runtime-adapter-node";
import { createMyServiceProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-my-service",

  create(context) {
    const config = runtimeConfigObject(context.config, "MyService");
    const apiKeyEnv = runtimeConfigString(config.apiKeyEnv, "MyService apiKeyEnv");
    return createMyServiceProvider({
      instance: context.instance,
      lane: context.lane,
      ...(apiKeyEnv === undefined ? {} : { apiKey: { env: apiKeyEnv } }),
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "concurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
    });
  },

  doctor(context) {
    const config = runtimeConfigObject(context.config, "MyService");
    const apiKeyEnv = runtimeConfigString(config.apiKeyEnv, "MyService apiKeyEnv")
      ?? "MY_SERVICE_API_KEY";
    return diagnoseRuntimeEnvironmentCredential(apiKeyEnv, "MyService");
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-my-service",
  hostFacets: [adapter],
};

export default svmlPackage;
```

`create` 函数根据 Runtime 配置构造 Endpoint。`doctor` 函数返回诊断信息（凭据是否存在、可执行文件是否可用），不构造也不调用任何东西。

## 5. 注册并锁定

在 `tsconfig.json` 中添加路径映射：

```json
"@narratage/provider-my-service": ["packages/provider-my-service/src/index.ts"]
```

锁定进 Runtime 包锁文件：

```bash
pnpm narratage lock-packages <runtime-lock> \
  --package @narratage/provider-my-service \
  --root .
```

## 6. 在 svml.runtime.json 中引用

```json
{
  "endpoints": [
    {
      "use": "@narratage/provider-my-service",
      "instance": "my-service.project",
      "lane": "generation",
      "config": {
        "apiKeyEnv": "MY_SERVICE_API_KEY",
        "defaultConcurrency": 2
      }
    }
  ],
  "permissions": [
    "network:api.my-service.com"
  ]
}
```

验证配置：

```bash
pnpm narratage doctor svml.runtime.json
```

## 可供研究的现有 Provider

| 包 | 模式 |
|---|---|
| `provider-kie` | 远程 API：上传、付费提交、带检查点的轮询、有界下载、即时 ArtifactStore 持久化 |
| `provider-media-local` | 本地进程：不经 shell 的 ffprobe/ffmpeg，执行有界 |
| `provider-whisperx-local` | 本地 sidecar：带热模型的 HTTP 服务，单次准入并发 |
| `provider-google-vertex` | 云 API：带 project/credentials 配置的 Vertex AI |
| `provider-hyperframes-local` | 本地进程：Chrome 渲染，带 worker 并行与输出探测校验 |
| `provider-image-opencv-local` | 本地 Python：有界的 OpenCV/NumPy，配合锁定的 Python 环境 |
