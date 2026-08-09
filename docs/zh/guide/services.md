---
title: 本地服务
description: 配置 WhisperX 与 OpenCV 边车服务。
---

# 本地服务

本地 Build 可能依赖托管边车、托管工具资产或由部署者维护的可执行文件。它们属于 Runtime
部署问题，不属于 Core，也不属于作者语言。

对于已经选定的 Runtime Profile，优先使用按 Profile 限定的生命周期：

```bash
pnpm narratage services up svml.runtime.json
pnpm narratage doctor svml.runtime.json
```

只有该 Profile 选择的 Provider 会被准备。`services up` 可以准备或启动部署状态；`doctor`
始终只读。下列命令是对应的手工操作。

## WhisperX

提供 ASR 以及针对特定语言的对齐能力，用于测量语音时序。

### 安装

WhisperX 3.8.6 支持 Python 3.10–3.13。仓库中已签入的锁文件选定 3.13：

```bash
uv python install 3.13
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
uv run --project services/whisperx --frozen svml-whisperx-check
```

`svml-whisperx-prepare` 会在完成 SHA-256 校验后，从固定版本的归档中安装 NLTK 的 `punkt_tab` 句子数据。WhisperX 的对齐流程需要这份数据，并且它绝不会在推理过程中下载。

首次启动模型时可能会下载 ASR 与对齐权重。生产环境应将 Hugging Face 缓存放在持久化存储上。

### 运行

```bash
uv run --project services/whisperx --frozen svml-whisperx-service
curl http://127.0.0.1:8765/health
```

### 配置

| 变量 | 默认值 | 含义 |
|---|---|---|
| `SVML_WHISPERX_PORT` | `8765` | 回环端口 |
| `SVML_WHISPERX_MODEL` | `small` | faster-whisper 模型 |
| `SVML_WHISPERX_DEVICE` | `cpu` | `cpu` 或已部署的加速器 |
| `SVML_WHISPERX_COMPUTE` | CPU 上为 `int8` | CTranslate2 计算类型 |
| `SVML_WHISPERX_BATCH_SIZE` | `8` | 有上界的 ASR 批大小 |
| `SVML_WHISPERX_INPUT_ROOTS` | 操作系统临时目录 | 以路径分隔符分隔的根目录，服务可读取其中内容 |
| `SVML_WHISPERX_NLTK_DATA` | 用户 SVML 缓存 | 已准备好的 NLTK 数据根目录 |
| `SVML_WHISPERX_MAX_REQUEST_BYTES` | `65536` | HTTP JSON 上限 |
| `SVML_WHISPERX_MAX_AUDIO_BYTES` | `536870912` | 暂存的规范 WAV 上限 |

### 并发

该服务同一时刻只接纳一次推理。第二个请求会收到 `503 BUSY`。并发由 Narratage Runtime Scheduler 的 lane 配置管控，而不是由服务自身管控。

Node Provider（`@narratage/provider-whisperx-local`）必须配置与之匹配的模型、设备、计算类型和批大小。一旦不匹配，会在结果被接受之前失败。

### 测试

```bash
pnpm test:whisperx-service
```

## OpenCV 图像服务

通过 `@narratage/provider-image-opencv-local` 提供有上界的图像变换（例如 GPT Image 的 YCrCb 降噪预设）。

### 安装

```bash
uv python install 3.13
uv sync --project services/image-opencv --frozen
```

使用官方 Runtime Adapter 时无需填写 `pythonExecutable`：`services up` 会准备这份冻结工程，
Endpoint、probe 与 doctor 都使用它的 `.venv`。显式填写 `pythonExecutable` 会把环境所有权交给
操作者，同时禁止无关的默认 prepare。

## HyperFrames 浏览器

`@narratage/provider-hyperframes-local` 声明按 Profile 管理的浏览器服务。`services up` 执行
`hyperframes browser ensure`；probe 会定位浏览器、运行 `--version`，并检查配置的 ffprobe。
无需预先全局安装 Chrome。

## FFmpeg 工具链

本地媒体 Provider 接受系统或显式配置的 `ffmpeg` 与 `ffprobe`。共享兼容性探针检查
`@narratage/media-execution` 真正使用的编码器和滤镜，而非强制某个版本号。`services up`
不会修改 Homebrew、apt 或其他系统包管理器。跨平台受管理二进制要等来源、校验和、平台矩阵
及再分发许可证冻结后再加入。

### 测试

测试由环境变量门控：

```bash
SVML_OPENCV_TESTS=1 \
SVML_OPENCV_PYTHON=services/image-opencv/.venv/bin/python \
pnpm test:image-opencv
```
