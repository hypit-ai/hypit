---
title: 包架构
description: 四个分层、依赖边界、包的结构与 facet。
---

# 包架构

`packages/` 下的 64 个以上工作区包被组织成四个架构分层。每一层都有严格的依赖规则，并由测试在每次提交时强制执行。

## 四个分层

### Layer 1：领域无关的基础层

这些包实现图语言、Build 状态机、编译器基础设施和 Runtime 端口。它们可以被任意领域复用 —— 不只是视频 —— 并且不依赖 Text、Script、Seedance、Film 或任何视频概念。

```text
@svml/protocol              immutable wire contracts
@svml/artifact              domain-neutral content-addressed byte type
@svml/core                  Demand compiler and Build state machine
@svml/source                mandatory Source Header
@svml/elaborator            author declarations and Fragment expansion
@svml/realization           typed realization overlays
@svml/run                   syntax-neutral Run Graph
@svml/validation            semantic admission
@svml/host                  Host-facing interfaces
@svml/compiler-node         reference Node compiler Host
@svml/workspace-fs-node     workspace filesystem abstraction
@svml/component-kit         Producer/validator registration
@svml/runtime               Scheduler and Store ports
@svml/runtime-adapter       deployment-adapter ABI
@svml/runtime-adapter-node  project-root resolution
@svml/endpoint-kit          Endpoint registration
@svml/driver-node           trusted Node command executor
@svml/package-loader-node   byte-locked package loading
@svml/store-sqlite          SQLite Build/Operation stores
@svml/artifact-store-fs     filesystem Artifact store
@svml/artifact-store-s3     S3 Artifact store
@svml/credential-store-env  environment credentials
@svml/transport             invocation seams
@svml/transport-process     local process transport
@svml/transport-aws-lambda  Lambda transport
@svml/local                 SQLite/filesystem developer assembly
```

### Layer 2：作者语言层

面向作者的词汇：文本 Frontend、Script Surface、SVS Recipe、Run 文本 Frontend 以及可复用的编译库。

```text
@svml/text                  official .svml markup Frontend
@svml/script                Script Surface
@svml/svs                   SVS Recipe Frontend
@svml/run-text              official .svrun Frontend
@svml/prompt-kit            declarative prompt compilation
@svml/compiler-text-node    Text Frontend + Surface Host assembly
```

### Layer 3：视频领域层

视频专属类型、生成模型族、语音/字幕/轨道契约以及合成。依赖 Layer 1 和 Layer 2，但不依赖任何 Provider。

```text
@svml/contracts             Narrative, Track, Composition contracts
@svml/media                 media types
@svml/generation            image/video product contracts
@svml/model-kit             model family abstractions
@svml/seedance              Seedance model family + author Surface
@svml/seedance-speaker      Seedance Speaker binding
@svml/minimax-h3            MiniMax H3 model family
@svml/gemini-omni           Gemini Omni model family
@svml/grok-imagine          Grok Imagine model family
@svml/gpt-image             GPT Image model family
@svml/nano-banana           Nano Banana model family
@svml/seedream              Seedream model family
@svml/estimate              duration estimation
@svml/speech-program        speech program compilation
@svml/speech-take           atomic speech take
@svml/speech-align          speech alignment
@svml/whisperx              WhisperX component
@svml/caption               caption planning and Track
@svml/caption-gemini        Gemini caption planner
@svml/broll                 B-roll Track
@svml/text-track            text overlay Track
@svml/film                  Film composition
@svml/hyperframes           HyperFrames Visual IR
@svml/hyperframes-render    HyperFrames rendering component
@svml/image-transform       image processing component
@svml/media-pipeline        media inspection/normalization
```

### Layer 4：Provider（Endpoint）包

具备特权的外部能力。依赖 Runtime 端口和它们所服务的模型族，绝不依赖 CLI。

```text
@svml/provider-kie                  KIE generation (16 model capabilities)
@svml/provider-media-local          local ffprobe/ffmpeg
@svml/provider-whisperx-local       local WhisperX sidecar
@svml/provider-google-vertex        Vertex Gemini caption planning
@svml/provider-hyperframes-local    local Chrome rendering
@svml/provider-image-opencv-local   local OpenCV image transforms
```

### 应用层

```text
@svml/cli           generic command engine (requires explicit Distribution)
@svml/video-cli     video command application (selects Text compiler, no built-in author packages)
```

## 依赖规则

`tools/package-boundaries.test.mjs` 在每次提交时强制执行三条不变式：

1. **无环的生产依赖图。** 任何 `@svml/*` 包之间都不存在依赖环。

2. **领域无关闭包。** 每个 Layer 1 包的传递闭包只包含 Layer 1 的包。`@svml/core` 只依赖 `@svml/protocol`。

3. **CLI 独立性。** `@svml/cli` 和 `@svml/video-cli` 都不会传递依赖任何 Provider 包。video CLI 同样不依赖任何作者层的视频包（`@svml/script`、`@svml/seedance-speaker`、`@svml/broll`、`@svml/text-track`、`@svml/film`）。作者包通过显式的 package lock 被 activate，而不是通过编译期的 CLI 依赖。

## 包的结构

每个包都位于 `packages/<name>/` 下，结构如下：

```text
packages/example/
├── package.json
├── src/
│   ├── index.ts          public API entry point
│   └── activation.ts     package contribution descriptor (if installable)
└── test/
    └── example.test.ts
```

### package.json

```json
{
  "name": "@svml/example",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "svml": {
    "activation": "./src/activation.ts"
  },
  "dependencies": {
    "@svml/protocol": "workspace:*"
  }
}
```

- `"exports"` 直接指向 TypeScript 源码。工作区的 `tsconfig.v2.json` 通过 `paths` 把 `@svml/*` 导入映射到源码入口。
- `"svml.activation"` 是该包被 byte-locked 时 Package Loader 会读取的入口。它必须默认导出一个 `NodePackageContribution`。

### activation.ts

每个可安装的包都会导出一个被动的 contribution 描述符 —— 它是对自身所提供内容的清单，而不是一份权限授予。具体示例参见[添加作者包](./author-packages.md)和[添加 Provider](./providers.md)。

## 五种包 facet

一个物理包可以暴露多个可独立 activate 的 facet：

| Facet | ABI | 权限 | 由谁选择 |
|---|---|---|---|
| `static` | Manifest 与身份 | 无 | 加载后始终可用 |
| `author` | Frontend、Surface、Graph Fragment | 仅作者词汇 | 源码中的 `<import>`，经由编译器 Host |
| `compute` | 确定性 Producer、Type Validator | 纯计算 | 编译器 Host |
| `endpoint` | 具备特权的外部能力 | 网络、文件系统、进程、凭据 | Runtime Profile |
| `runtime` | Scheduler、Store 实现 | 持久化、调度 | Runtime Profile |

源码中的 `<import>` 只会 activate author facet。它绝不授予网络、文件系统、进程、凭据或队列权限。

## 包锁定

SVML 使用按字节锁定的受信任代码执行。加载器会记录每个包的名称、版本和 SHA-256 摘要：

```json
{
  "format": "svml.node-package-lock@1",
  "artifacts": [
    {
      "name": "@svml/seedance",
      "version": "0.0.0-dev",
      "digest": "sha256:abc123..."
    }
  ]
}
```

两个相互独立的 lock 闭包服务于不同的权限范围：

| Lock 文件 | 包含内容 | 身份范围 |
|---|---|---|
| `svml.packages.lock` | Frontend、Surface、Producer、Validator | Author Graph + Run Graph + 执行 Program Closure |
| `svml.runtime-packages.lock` | Provider、Store、transport | Runtime Closure |

修改一个包就需要重新生成 lock。Build 状态机在下发 Command 之前会校验每一个摘要。
