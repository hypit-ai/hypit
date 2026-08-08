---
title: 本地服务
description: 配置 WhisperX 与 OpenCV 服务。
---

# 本地服务

两个 Python 服务为本地 Build 提供支持。它们属于 Runtime 部署包，不属于 Core，也不属于作者语言。

## 自动配置

通常你不需要手动执行本页的任何命令。`pnpm install` 会准备好所有已安装 Provider 声明的服务，
`narratage build` 会自动启动它们：

```bash
pnpm install     # 准备 Python 环境
pnpm narratage build build.svrun --runtime svml.runtime.json --follow
```

Build 只启动其 Runtime Profile 声明的服务，并在 Build 之间保持运行以避免重新加载热模型。
如果某个服务无法连通，Build 会在第一个 Operation 之前停止——不会浪费付费生成。

需要时可以直接管理服务：

```bash
pnpm narratage services status svml.runtime.json   # 查看运行状态
pnpm narratage services up svml.runtime.json       # 只启动，不 Build
pnpm narratage services down svml.runtime.json     # 停止本项目启动的服务
pnpm narratage build … --no-services               # 跳过自动启动，使用已运行的服务
```

当 `uv` 不在 PATH 中时，`pnpm install` 会跳过准备并给出提示，不会导致安装失败。
本页下面的内容是这些命令实际执行的操作，供某个步骤失败或在仓库外部署时参考。

## WhisperX

提供 ASR 以及针对特定语言的对齐能力，用于测量语音时序。

### 手动安装

`pnpm install` 会自动执行前三条命令。WhisperX 3.8.6 支持 Python 3.10–3.13，仓库中的锁文件选定 3.13：

```bash
uv python install 3.13
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
uv run --project services/whisperx --frozen svml-whisperx-check
```

`svml-whisperx-prepare` 会在完成 SHA-256 校验后，从固定版本的归档中安装 NLTK 的 `punkt_tab`
句子数据。WhisperX 的对齐流程需要这份数据，推理过程中不会下载。

首次启动模型时可能会下载 ASR 与对齐权重。生产环境应将 Hugging Face 缓存放在持久化存储上。

### 手动运行

`narratage build` 和 `narratage services up` 会自动运行此服务，日志写入
`.svml/services/whisperx.log`。如需前台运行：

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

该服务同一时刻只接纳一次推理。第二个请求会收到 `503 BUSY`。并发由 Narratage Runtime Scheduler
的 lane 配置管控，而不是由服务自身管控。

Node Provider（`@narratage/provider-whisperx-local`）必须配置与之匹配的模型、设备、计算类型和批大小。一旦不匹配，会在结果被接受之前失败。

### 测试

```bash
pnpm test:whisperx-service
```

## OpenCV 图像服务

通过 `@narratage/provider-image-opencv-local` 提供有上界的图像变换（例如 GPT Image 的 YCrCb
降噪预设）。

OpenCV 以每个 Need 一个有界进程运行，没有需要保持热加载的程序——准备好环境就是全部工作，
`narratage services status` 会报告解释器是否携带可用的 `cv2` 和 `numpy`。

### 手动安装

`pnpm install` 会自动执行以下命令：

```bash
uv python install 3.13
uv sync --project services/image-opencv --frozen
```

### 测试

测试由环境变量门控：

```bash
SVML_OPENCV_TESTS=1 \
SVML_OPENCV_PYTHON=services/image-opencv/.venv/bin/python \
pnpm test:image-opencv
```
