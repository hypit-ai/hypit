---
title: 包架构
description: 七个分层、依赖边界、包的结构与 facet。
---

# 包架构

`packages/` 下的工作区包被组织成七个架构分层。每个包自行声明依赖。根工作区会安装完整源码树，让 Package
Loader 能解析任意被显式选择的包；但 TypeScript 不维护会掩盖漏依赖的中央路径别名。

## 七个分层

### Layer 1：Narratage Core

不可变图协议、需求编译器与 Build 状态机。这个闭包与领域无关，不认识源码语法、文件、网络、模型或视频。

```text
@narratage/protocol              immutable wire contracts
@narratage/core                  Demand compiler and Build state machine
```

### Layer 2：Compiler

负责 Source 发现、Frontend、导入、图展开与参考 Node Host。Source 在强制 Header 中选择自己的
Frontend；不存在一个认识全部语法的中央解析器。

```text
@narratage/source                mandatory Source Header
@narratage/elaborator            author declarations and Fragment expansion
@narratage/run                   syntax-neutral Run Graph
@narratage/validation            semantic admission
@narratage/host                  opaque Host-facet envelope
@narratage/workspace             replaceable Source/Asset session
@narratage/compiler-node         reference Node compiler Host
@narratage/workspace-fs-node     workspace filesystem abstraction
@narratage/package-loader-node   installed package selection
@narratage/markup                official .svml Markup Frontend
@narratage/svs                   SVS Recipe Frontend
@narratage/run-markup            official .svrun Markup Frontend
@narratage/compiler-markup-node  Markup Frontend + Surface Host assembly
```

### Layer 3：Foundations

可复用的数据与确定性构件。它们支撑视频创作，但不决定成片的创作结构，也不调用外部服务。

```text
@narratage/artifact              内容寻址字节
@narratage/component-kit         Producer 与 Validator 注册
@narratage/text                  图原生文字模板
@narratage/media                 媒体值
@narratage/temporal              Selection 与 Moment 投影
@narratage/spatial               布局几何
@narratage/visual-ir             渲染器无关的视觉词汇
@narratage/fonts-open            可分发字体资产
@narratage/media-pipeline        媒体探测与规范化
@narratage/media-execution       共享 ffmpeg 执行体
@narratage/transport             调用边界
@narratage/transport-aws-lambda  Lambda transport
```

### Layer 4：Video authoring

赋予 SVML 视频词汇的包：稿件、精确模型需求、语音、字幕、平级 Track、Film 与渲染声明。
它们依赖公共合同，但不依赖某个具体 Provider 部署。

```text
@narratage/narrative             authored narrative products
@narratage/script                Script Surface
@narratage/program-space         exact frame/sample domain
@narratage/generation            图像/视频/音频生成合同
@narratage/model-kit             model family abstractions
@narratage/seedance              Seedance model family + author Surface
@narratage/seedance-kits         数据化的 Seedance 语义 Text Template
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
@narratage/caption               caption planning and timing
@narratage/caption-gemini        Gemini caption planner
@narratage/caption-fine          无字段细粒度字幕 Track family
@narratage/media-track           统一的 Media Item/Sequence Track
@narratage/typography-track      typography overlay Track
@narratage/audio-track           arbitrary sample-domain Audio Track
@narratage/deck-track            depth-stack collection Track
@narratage/ranking               four ranking component families
@narratage/screen-overlay        self-contained full-canvas overlays
@narratage/film                  Film composition
@narratage/composition           peer Track composition
@narratage/hyperframes           HyperFrames document compiler
@narratage/render-hyperframes    explicit HyperFrames rendering component
@narratage/image-transform       image processing component
@narratage/image-compose         有序静态图像合成
@narratage/raster                共享确定性光栅执行合同
@narratage/background-removal    外部图像去背景能力
```

### Layer 5：Providers

具备特权的外部能力。依赖 Runtime 端口与共享能力词汇，不依赖精确模型包，也绝不依赖 CLI。

```text
@narratage/provider-kie                  KIE 生成与去背景
@narratage/provider-media-local          local ffprobe/ffmpeg
@narratage/provider-whisperx-local       local WhisperX service
@narratage/provider-google-vertex        Vertex Gemini caption planning
@narratage/provider-hyperframes-local    local Chrome rendering
@narratage/provider-hyperframes-aws-lambda asynchronous distributed rendering
@narratage/provider-image-opencv-local   本地 OpenCV 光栅执行
@narratage/provider-media-aws-lambda     synchronous AWS media execution
@narratage/provider-xiaomi-mimo           Xiaomi 官方 MiMo TTS API
```

### Layer 6：Runtime

领域无关的执行端口与可替换部署实现。Runtime 包负责队列、Store、凭据与进程生命周期，
但不定义作者语法。

```text
@narratage/runtime               Scheduler、Worker 与 Store 端口
@narratage/endpoint-kit          Endpoint 声明
@narratage/driver-node           可信 Node Command 执行器
@narratage/runtime-kit           部署包 ABI
@narratage/runtime-host-node     Node Runtime Host ABI
@narratage/runtime-local         本地 Worker 与组装
@narratage/store-sqlite          SQLite 状态
@narratage/artifact-store-fs     文件系统 Artifact
@narratage/artifact-store-s3     S3 Artifact
@narratage/credential-store-env  环境变量凭据
@narratage/credential-store-keychain macOS Keychain 凭据
```

### Layer 7：Applications

```text
@narratage/cli                 generic command engine (requires explicit Distribution)
@narratage/video-cli           video command application (selects Markup compiler, no built-in author packages)
@narratage/caption-playground  development preview for Caption SVML and SVS recipes
@narratage/svml-playground     development preview for a Source, never runs a Provider
```

## 依赖规则

包结构遵循三条依赖规则：

1. **无环的生产依赖图。** 任何 `@narratage/*` 包之间都不存在依赖环。

2. **领域无关 Core 闭包。** Layer 1 只有 `protocol` 与 `core`，且 `core` 只依赖 `protocol`。
   Compiler 与 Runtime 也可以领域无关，但它们不属于 Core。

3. **CLI 独立性。** `@narratage/cli` 和 `@narratage/video-cli` 都不会传递依赖任何 Provider 包。video CLI 同样不依赖任何作者层的视频包（`@narratage/script`、`@narratage/seedance`、`@narratage/media-track`、`@narratage/typography-track`、`@narratage/film`）。Source import 按需激活作者包，Runtime Profile 的逻辑 `use` 名称按需激活运行包；两者都不是 CLI 的编译期依赖。

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
  "narratage": {
    "activation": "./src/activation.ts"
  },
  "dependencies": {
    "@narratage/protocol": "workspace:*"
  }
}
```

- `"exports"` 在开发期间直接指向 TypeScript 源码。pnpm 工作区链接根据导入包自身声明的依赖解析 `@narratage/*`。
- `"narratage.activation"` 是该包被选择时 Package Loader 会读取的入口。它必须默认导出一个 `NodePackageContribution`。
- 物理包版本在真正发布前保持 `0.0.0-dev`。Module 与 Frontend manifest 使用相互独立的逻辑协议版本 `1`。

### activation.ts

每个可安装的包都会导出一个被动的 contribution 描述符 —— 它是对自身所提供内容的清单，而不是一份权限授予。具体示例参见 [添加作者包](./author-packages.md) 和 [添加 Provider](./providers.md)。

## 五种包 facet

一个物理包可以暴露多个可独立 activate 的 facet：

| Facet | ABI | 能力边界 | 由谁选择 |
|---|---|---|---|
| `static` | Manifest 与身份 | 无 | 加载后始终可用 |
| `author` | Frontend、Surface、Graph Fragment | 仅作者词汇 | 源码中的 `<import>`，经由编译器 Host |
| `compute` | 确定性 Producer、Type Validator | 纯计算 | 编译器 Host |
| `endpoint` | 具备特权的外部能力 | 网络、文件系统、进程、凭据 | Runtime Profile |
| `infrastructure` | Scheduler、Worker 与 Store 实现 | 持久化、调度 | Runtime Profile |

源码中的 `<import>` 只会 activate author facet。它绝不授予网络、文件系统、进程、凭据或队列权限。

## 包选择

Narratage 不维护中央包注册表，也不维护自定义包锁。npm 或 pnpm 负责安装、版本与字节完整性。
系统只有两条显式选择路径：

| 选择来源 | 被激活的包 |
|---|---|
| Source import | Frontend、Surface、Producer、Validator |
| Runtime Profile 的 `use` | Runtime Host、基础设施与 Provider Endpoint |

Source import 绝不授予网络、文件系统、进程、凭据或队列权限；这些权限只属于 Runtime
Profile 显式选择的包。

### 逻辑包地址与 Source 发现

Source 写的是逻辑语言能力。逻辑名按约定直接对应已安装的 npm 包名；Host ABI 仍让 Module
与 Run Fragment 可以使用同一名字而不混为一种能力，一个物理包也可以提供多个逻辑名字。

编译首先只读取强制 Source Header，从已安装包解析对应 Frontend，调用该 Frontend 自己的
`discover()`，继续解析它报告的 Module、Run Fragment 与子 Source，直到本次需要的精确包
子集不再增长，然后才开始语义解码。Markup 是 video Distribution 的启动 Frontend；除此
之外，Script、SVS、Run Markup 和第三方 Frontend 都走同一套发现协议，包选择器不再含有
针对某种解析器的分支。

Frontend 实现不是物理包格式里的特权字段。它们与 Run Fragment、Markup Surface、Runtime
Adapter 一样，通过自己的 Host ABI 发布普通 facet；Frontend 使用
`narratage.source-frontend@1`，只有 Source Host 会解释它。

Runtime Profile 也遵循同一规则。每个 `use` 选择的是 Runtime Host、Endpoint Adapter 或 Runtime
Infrastructure ABI 加逻辑名；物理 npm 包只负责声明它提供这个逻辑能力。通用 CLI 不维护
Provider 注册表；同名的 Endpoint Adapter 与 Runtime
Infrastructure Adapter 也不会互相冲突。

加载器不会下载包，也不会扫描无关依赖来寻找插件。它只加载 Source 或 Runtime Profile
明确选择的包，以及这些包 Manifest 精确声明的 Module 依赖。
