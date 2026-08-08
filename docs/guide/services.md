---
title: Local Services
description: Setting up the WhisperX and OpenCV services.
---

# Local Services

Two Python services support local Builds. They are Runtime deployment packages, not part
of Core or the author language.

## Automatic setup

You normally do not run any of the commands on this page. `pnpm install` prepares every service
that an installed Provider declares, and `narratage build` starts them:

```bash
pnpm install     # prepares the Python environments
pnpm narratage build build.svrun --runtime svml.runtime.json --follow
```

A Build starts only the services its Runtime Profile declares, leaves them running between Builds
so a warm model is not reloaded, and stops before its first Operation if one cannot be reached —
so an unavailable service never costs a paid generation.

Manage them directly when you need to:

```bash
pnpm narratage services status svml.runtime.json   # what is running
pnpm narratage services up svml.runtime.json       # start without building
pnpm narratage services down svml.runtime.json     # stop what this project started
pnpm narratage build … --no-services               # build against what is already running
```

`pnpm install` skips preparation when `uv` is absent and says so; it never fails the install. The
rest of this page is what those commands run, for when one of them fails or you are deploying
outside this repository.

## WhisperX

Provides ASR and language-specific alignment for speech timing measurement.

### Install by hand

`pnpm install` runs the first three of these. WhisperX 3.8.6 supports Python 3.10–3.13, and the
checked-in lock selects 3.13:

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

### Run by hand

`narratage build` and `narratage services up` run this for you, logging to
`.svml/services/whisperx.log`. To run it in the foreground instead:

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
Concurrency is governed by the Narratage Runtime Scheduler's lane configuration, not the service
itself.

The Node Provider (`@narratage/provider-whisperx-local`) must be configured with matching model,
device, compute and batch size. A mismatch fails before results are accepted.

### Tests

```bash
pnpm test:whisperx-service
```

## OpenCV image service

Provides bounded image transforms (e.g. the GPT Image YCrCb denoise preset) through
`@narratage/provider-image-opencv-local`.

OpenCV runs as one bounded process per Need, so there is no program to keep warm — preparing the
environment is the whole job, and `narratage services status` reports whether the interpreter
carries a usable `cv2` and `numpy`.

### Install by hand

`pnpm install` runs this:

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
