---
title: Local Services
description: Setting up the WhisperX and OpenCV services.
---

# Local Services

Local Builds may depend on managed sidecars, managed tool assets or operator-owned executables.
They are Runtime deployment concerns, not part of Core or the author language.

For an installed Runtime Profile, prefer the profile-scoped lifecycle:

```bash
pnpm narratage services up svml.runtime.json
pnpm narratage doctor svml.runtime.json
```

Only Providers selected by that Profile are prepared. `services up` may prepare or start deployment
state; `doctor` is read-only. The commands below are the equivalent manual operations.

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

Provides one bounded Raster interpreter for both image transforms (e.g. the GPT Image YCrCb denoise
preset) and explicit ordered Canvas/Layer composition through `@narratage/provider-image-opencv-local`.

OpenCV runs as one bounded process per Need, so there is no program to keep warm — preparing the
environment is the whole job, and `narratage services status` reports whether the interpreter
carries a usable `cv2` and `numpy`.

### Install by hand

`pnpm install` runs this:

```bash
uv python install 3.13
uv sync --project services/image-opencv --frozen
```

With the official Runtime Adapter no `pythonExecutable` is required: `services up` prepares this
frozen project and the Endpoint, probe and doctor all use its `.venv`. Supplying
`pythonExecutable` transfers ownership to the operator and disables the unrelated managed prepare.

## HyperFrames browser

`@narratage/provider-hyperframes-local` declares a profile-scoped browser service. `services up`
runs `hyperframes browser ensure`; its probe resolves the browser, starts `--version`, and verifies
the configured ffprobe. No globally installed Chrome is required.

## FFmpeg toolchain

The local media Provider accepts system or explicitly configured `ffmpeg` and `ffprobe`. Its shared
compatibility probe checks the encoders and filters actually used by `@narratage/media-execution`,
not one blessed version string. `services up` never mutates Homebrew, apt or another system package
manager. A managed cross-platform binary remains deferred until its source, checksums, platform
matrix and redistribution license are frozen.

### Tests

Tests are gated behind environment variables:

```bash
SVML_OPENCV_TESTS=1 \
SVML_OPENCV_PYTHON=services/image-opencv/.venv/bin/python \
pnpm test:image-opencv
```
