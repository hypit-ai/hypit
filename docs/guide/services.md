---
title: Local Services
description: Setting up the WhisperX and OpenCV sidecar services.
---

# Local Services

Two Python sidecar services support local Builds. They are Runtime deployment packages, not part
of Core or the author language.

## WhisperX

Provides ASR and language-specific alignment for speech timing measurement.

### Install

WhisperX 3.8.6 supports Python 3.10–3.13. The checked-in lock selects 3.13:

```bash
uv python install 3.13
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
uv run --project services/whisperx --frozen svml-whisperx-check
```

`svml-whisperx-prepare` installs NLTK's `punkt_tab` sentence data from a pinned archive after
SHA-256 verification. This is required by WhisperX alignment and is never downloaded during
inference.

The first model start may download ASR and alignment weights. Production should put the Hugging
Face cache on persistent storage.

### Run

```bash
uv run --project services/whisperx --frozen svml-whisperx-service
curl http://127.0.0.1:8765/health
```

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SVML_WHISPERX_PORT` | `8765` | loopback port |
| `SVML_WHISPERX_MODEL` | `small` | faster-whisper model |
| `SVML_WHISPERX_DEVICE` | `cpu` | `cpu` or deployed accelerator |
| `SVML_WHISPERX_COMPUTE` | `int8` on CPU | CTranslate2 compute type |
| `SVML_WHISPERX_BATCH_SIZE` | `8` | bounded ASR batch size |
| `SVML_WHISPERX_INPUT_ROOTS` | OS temp dir | path-separated roots the service may read |
| `SVML_WHISPERX_NLTK_DATA` | user SVML cache | prepared NLTK data root |
| `SVML_WHISPERX_MAX_REQUEST_BYTES` | `65536` | HTTP JSON bound |
| `SVML_WHISPERX_MAX_AUDIO_BYTES` | `536870912` | staged canonical WAV bound |

### Concurrency

The service admits exactly one inference at a time. A second request receives `503 BUSY`.
Concurrency is governed by the SVML Runtime Scheduler's lane configuration, not the service
itself.

The Node Provider (`@svml/provider-whisperx-local`) must be configured with matching model,
device, compute and batch size. A mismatch fails before results are accepted.

### Tests

```bash
pnpm test:whisperx-service
```

## OpenCV image service

Provides bounded image transforms (e.g. the GPT Image YCrCb denoise preset) through
`@svml/provider-image-opencv-local`.

### Install

```bash
uv python install 3.13
uv sync --project services/image-opencv --frozen
```

### Tests

Tests are gated behind environment variables:

```bash
SVML_OPENCV_TESTS=1 \
SVML_OPENCV_PYTHON=services/image-opencv/.venv/bin/python \
pnpm test:image-opencv
```
