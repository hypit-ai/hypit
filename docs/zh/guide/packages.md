---
title: 包架构
description: 五个分层、依赖边界、包的结构与 facet。
---

# 包架构

`packages/` 下的工作区包被组织成五个架构分层。每一层都有严格的依赖规则，并由测试在每次提交时强制执行。

## 五个分层

### Layer 1：领域无关的基础层

这些包实现图语言、Build 状态机、编译器基础设施和 Runtime 端口。它们可以被任意领域复用 —— 不只是视频 —— 并且不依赖 Text、Script、Seedance、Film 或任何视频概念。

```text
@narratage/protocol              immutable wire contracts
@narratage/artifact              domain-neutral content-addressed byte type
@narratage/core                  Demand compiler and Build state machine
@narratage/source                mandatory Source Header
@narratage/elaborator            author declarations and Fragment expansion
@narratage/run                   syntax-neutral Run Graph
@narratage/validation            semantic admission
@narratage/host                  Host-facing interfaces
@narratage/compiler-node         reference Node compiler Host
@narratage/workspace-fs-node     workspace filesystem abstraction
@narratage/component-kit         Producer/validator registration
@narratage/runtime               Scheduler and Store ports
@narratage/runtime-adapter       deployment-adapter ABI
@narratage/runtime-adapter-node  project-root resolution
@narratage/endpoint-kit          Endpoint registration
@narratage/driver-node           trusted Node command executor
@narratage/package-loader-node   byte-locked package loading
@narratage/store-sqlite          SQLite Build/Operation stores
@narratage/artifact-store-fs     filesystem Artifact store
@narratage/artifact-store-s3     S3 Artifact store
@narratage/credential-store-env  environment credentials
@narratage/credential-store-keychain macOS Keychain credentials
@narratage/transport             invocation seams
@narratage/transport-aws-lambda  Lambda transport
@narratage/local                 SQLite/filesystem developer assembly
```

### Layer 2：作者语言层

面向作者的词汇：Markup Frontend、Script Surface、SVS Recipe、Run Markup Frontend，以及可复用的确定性文字编译。

```text
@narratage/markup                official .svml Markup Frontend
@narratage/script                Script Surface
@narratage/svs                   SVS Recipe Frontend
@narratage/run-markup            official .svrun Markup Frontend
@narratage/text                  图原生文字值、模板和确定性渲染
@narratage/compiler-markup-node  Markup Frontend + Surface Host assembly
```

`@narratage/text` 的语义与领域无关，只是位于作者语言层。它输出的普通 `Text` 可以进入模型端口，
也可以进入可见的视频组件。消费者依赖 Text 窄腰；Text 绝不会反向依赖 Typography、Ranking、
Sticker、Deck 或任何模型家族。

### Layer 3：视频领域层

视频专属类型、生成模型族、语音/字幕/轨道契约以及合成。依赖 Layer 1 和 Layer 2，但不依赖任何 Provider。

```text
@narratage/media                 media types
@narratage/narrative             authored narrative products
@narratage/program-space         exact frame/sample domain
@narratage/generation            图像/视频/音频生成合同
@narratage/model-kit             model family abstractions
@narratage/seedance              Seedance model family + author Surface
@narratage/seedance-speaker      Seedance Speaker binding
@narratage/minimax-h3            MiniMax H3 model family
@narratage/gemini-omni           Gemini Omni model family
@narratage/grok-imagine          Grok Imagine model family
@narratage/gpt-image             GPT Image model family
@narratage/nano-banana           Nano Banana model family
@narratage/seedream              Seedream model family
@narratage/mimo-tts              三个精确 Xiaomi MiMo TTS 模型及作者 Surface
@narratage/estimate              duration estimation
@narratage/speech                shared speech products
@narratage/speech-basis          generated speech A/V product
@narratage/speech-evidence       acoustic evidence products
@narratage/semantic-map          authored-token timing map
@narratage/speech-alignment      speech alignment
@narratage/speech-spine          ordered speech-take compilation
@narratage/whisperx              WhisperX component
@narratage/temporal              Selection/Moment 投影与调度
@narratage/spatial               Canvas/Frame/Point/Path 几何
@narratage/caption               caption planning and timing
@narratage/caption-gemini        Gemini caption planner
@narratage/caption-fine          无字段细粒度字幕 Track family
@narratage/fonts-open            exact redistributable font catalog
@narratage/media-track           统一的 Media Item/Sequence Track
@narratage/typography-track      typography overlay Track
@narratage/audio-track           arbitrary sample-domain Audio Track
@narratage/deck-track            depth-stack collection Track
@narratage/ranking               four ranking component families
@narratage/screen-overlay        self-contained full-canvas overlays
@narratage/film                  Film composition
@narratage/composition           peer Track composition
@narratage/visual-ir             renderer-neutral visual vocabulary
@narratage/hyperframes           HyperFrames document compiler
@narratage/render-hyperframes    explicit HyperFrames rendering component
@narratage/image-transform       image processing component
@narratage/image-compose         有序静态图像合成
@narratage/raster                共享确定性光栅执行合同
@narratage/background-removal    外部图像去背景能力
@narratage/media-pipeline        media inspection/normalization
@narratage/media-execution       shared ffmpeg execution body for Providers
```

### Layer 4：Provider（Endpoint）包

具备特权的外部能力。依赖 Runtime 端口与共享能力词汇，不依赖精确模型包，也绝不依赖 CLI。

```text
@narratage/provider-kie                  KIE 生成与去背景
@narratage/provider-media-local          local ffprobe/ffmpeg
@narratage/provider-whisperx-local       local WhisperX service
@narratage/provider-google-vertex        Vertex Gemini caption planning
@narratage/provider-hyperframes-local    local Chrome rendering
@narratage/provider-hyperframes-aws-lambda recoverable distributed rendering
@narratage/provider-image-opencv-local   本地 OpenCV 光栅执行
@narratage/provider-media-aws-lambda     synchronous AWS media execution
@narratage/provider-xiaomi-mimo           Xiaomi 官方 MiMo TTS API
```

### Layer 5：应用层

```text
@narratage/cli           generic command engine (requires explicit Distribution)
@narratage/video-cli     video command application (selects Markup compiler, no built-in author packages)
```

## 依赖规则

`tools/package-boundaries.test.mjs` 在每次提交时强制执行三条不变式：

1. **无环的生产依赖图。** 任何 `@narratage/*` 包之间都不存在依赖环。

2. **领域无关闭包。** 每个 Layer 1 包的传递闭包只包含 Layer 1 的包。`@narratage/core` 只依赖 `@narratage/protocol`。

3. **CLI 独立性。** `@narratage/cli` 和 `@narratage/video-cli` 都不会传递依赖任何 Provider 包。video CLI 同样不依赖任何作者层的视频包（`@narratage/script`、`@narratage/seedance-speaker`、`@narratage/media-track`、`@narratage/typography-track`、`@narratage/film`）。作者包通过显式的 package lock 被 activate，而不是通过编译期的 CLI 依赖。

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
  "name": "@narratage/example",
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
    "@narratage/protocol": "workspace:*"
  }
}
```

- `"exports"` 直接指向 TypeScript 源码。工作区的 `tsconfig.json` 通过 `paths` 把 `@narratage/*` 导入映射到源码入口。
- `"svml.activation"` 是该包被 byte-locked 时 Package Loader 会读取的入口。它必须默认导出一个 `NodePackageContribution`。
- 物理包版本在真正发布前保持 `0.0.0-dev`。Module 与 Frontend manifest 使用相互独立的逻辑协议版本 `1`；精确的实现身份由 lock 摘要确定。

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
      "name": "@narratage/seedance",
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
