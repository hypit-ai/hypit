---
title: 添加 Provider
description: 添加新 Endpoint 适配器的分步指南。
---

# 添加 Provider

一个 Provider 包实现一项受控的外部能力——视频生成、媒体处理、对齐或渲染。字幕作者语义
和 Cue 分组由 Script 自己负责，不需要 Provider。Provider 通过 Runtime Profile 激活，而不是
通过 Author Source 里的 `<import>`。

不需要改动 Core、CLI 或任何作者包。

## 1. 创建包

```bash
mkdir -p packages/provider-my-service/src packages/provider-my-service/test
```

## 2. 编写 package.json

Provider 包依赖 Runtime 端口与共享能力词汇，不依赖精确模型包，也绝不依赖 CLI：

```json
{
  "name": "@hypit/provider-my-service",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "hypit": { "activation": "./src/activation.ts" },
  "dependencies": {
    "@hypit/endpoint-kit": "workspace:*",
    "@hypit/protocol": "workspace:*",
    "@hypit/runtime": "workspace:*",
    "@hypit/runtime-kit": "workspace:*",
    "@hypit/runtime-host-node": "workspace:*",
    "@hypit/generation": "workspace:*"
  }
}
```

## 3. 实现 Provider

Provider 处理来自 Scheduler 的 Command：提交请求、轮询、下载，并把字节交给当前 Build 的临时工作区。

```typescript
// src/provider.ts
import { defineEndpointPackage } from "@hypit/endpoint-kit";

export function createMyServiceProvider(options: {
  instance: string;
  pool: string;
  apiKey: CredentialRef;
  defaultConcurrency?: number;
}) {
  return defineEndpointPackage({
    module: { name: "@hypit/provider-my-service", version: "1" },
    facet: "service",
    instance: options.instance,
    pool: options.pool,
    credentials: { apiKey: options.apiKey },
    defaultConcurrency: options.defaultConcurrency ?? 2,
    capabilities: [{
      capability: myCapability,
      returns: myResultType,
      capacity: "generate",
      lifecycle: "asynchronous",
      endpoint: myAsyncEndpoint,
    }],
  });
}
```

可以参考现有的 Provider：
- `packages/provider-kie/src/provider.ts` — 带上传、轮询和下载的远程生成
- `packages/provider-media-local/` — 本地进程执行（ffprobe/ffmpeg）
- `packages/provider-whisperx-local/` — 本地 HTTP 服务
- `packages/provider-hyperframes-local/` — 本地 Chrome 渲染
- `packages/provider-hyperframes-aws-lambda/` — 异步 Step Functions/Lambda 渲染
- `packages/provider-media-aws-lambda/` — 通过共享 ffmpeg 执行体完成同步 Lambda 媒体操作
- `packages/provider-xiaomi-mimo/` — 不依赖 MiMo 模型包的官方即时音色设计与音色克隆 API

## 4. 编写 activation 描述符

```typescript
// src/activation.ts
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
} from "@hypit/runtime-kit";
import { createMyServiceProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-my-service",

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

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [adapter],
};

export default hypitPackage;
```

`activate` 是唯一的纯部署声明。它返回的 Endpoint 同时拥有供 `doctor` 与执行使用的凭据引用、
capability 和调度事实。Activation 不得解析密钥或环境来源的部署值、访问网络或启动任务；环境变量名会作为引用保留到真正处理匹配 Need 时。凭据是否存在由通用 CredentialStore 路径诊断，
Provider 不得把环境变量硬编码成特殊的密钥 Store。

Activation 还可以返回 `diagnose(context)`。它只会在用户显式运行主动 `doctor` 时执行，而且
Runtime 会先解析该 Endpoint 自己声明的凭据槽。它可以对真实服务做一次有界只读请求，例如读取
已认证账户的模型目录；Build 预检不能调用它，它也绝不能提交生成任务。

收费的 Provider 只声明一件事：价格发布在哪里。在 `defineEndpointPackage` 上写 `pricing: { kind: "page", url }`，指向 Provider 自己的公开价格页；在本机运行的 Provider 声明 `pricing: { kind: "local" }`。Hypit 不复制也不解释价格；`hypit plan --runtime <profile>` 会列出每个请求的 Endpoint，本地工作明确标成本地，Provider 工作附带它自己的价格页，Agent 在付费 Build 之前去原始页面读价。未声明价格来源的会被报告为未知。上游文件尚未生成时，能力包仍重建全部作者参数，只把未来文件保留为符号 Resource 槽；同一个 Endpoint 的普通 `supports` 会在 Build 入队前检查这份规格。包无法说明请求时直接停止，不回退成 capability-only 的假验证，也不维护第二张选择表。

## 5. 按需声明 Managed Program

如果 Provider 依赖需要保持温热的外部程序，就在 Endpoint 旁边导出它的声明。这里没有第二个
manifest 开关，也没有中央 Program 注册表：

```typescript
// src/program.ts
import type { ManagedProgram } from "@hypit/runtime-kit";

export function createMyProgram(): ManagedProgram {
  return {
    id: "my-service",
    prepare: { command: "uv", args: ["sync", "--project", "services/my-service", "--frozen"] },
    start: { command: "uv", args: ["run", "--project", "services/my-service", "--frozen", "hypit-my-service"] },
    probe: async () => {
      // 返回 { state: "ready" } 或 { state: "down", detail: "..." }
    },
  };
}
```

在同一个 activation 中把它与 Endpoint 一起返回：

```typescript
const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-my-service",
  activate(context) {
    return {
      endpoint: createMyServiceProvider(/* 已解析配置 */),
      program: createMyProgram(),
    };
  },
});
```

`hypit runtime up` 会准备、启动并探测**本地** Managed Program，然后启动耐久 Worker。`build` 只预检
本次 Plan 所需 Capability 对应的 Program；未就绪时在提交前失败，绝不安装或启动它。只调用
远程 API 的 Provider 不返回 `program`，Hypit 也没有可以启动或停止这类服务的生命周期。

## 6. 声明依赖

在 Provider 自己的 `package.json` 中声明所有导入包：

```json
"dependencies": {
  "@hypit/runtime-kit": "workspace:*"
}
```

用项目的包管理器安装它。Runtime Profile 用 `use` 显式实例化之前，这个包始终不会运行。

## 7. 在 hypit.runtime.json 中引用

```json
{
  "endpoints": {
    "my-service": {
      "use": "@hypit/provider-my-service",
      "pool": "my-service.account",
      "config": {
        "apiKey": { "store": "os", "key": "my-service.api-key" },
        "defaultConcurrency": 2
      }
    }
  }
}
```

验证配置：

```bash
hypit doctor hypit.runtime.json
```

## 可供研究的现有 Provider

| 包 | 模式 |
|---|---|
| `provider-kie` | 远程 API：上传、付费提交、带检查点的轮询、有界下载、写入当前 Build 工作区 |
| `provider-media-local` | 本地进程：不经 shell 的 ffprobe/ffmpeg，执行有界 |
| `provider-whisperx-local` | 本地 HTTP 服务：带热模型，单次准入并发 |
| `provider-hyperframes-local` | 本地进程：Chrome 渲染，带 worker 并行与输出探测校验 |
| `provider-hyperframes-aws-lambda` | 远程异步任务：按 Operation 自行暂存、Step Functions 轮询与结果流式回收 |
| `provider-image-opencv-local` | 本地 Python：有界的 OpenCV/NumPy，配合锁定的 Python 环境 |
| `provider-media-aws-lambda` | 远程同步 Lambda：与本地媒体相同的九项能力 |
| `provider-xiaomi-mimo` | 远程即时 API：把精确 MiMo 音色设计与音色克隆请求落成持久化音频 Resource |
