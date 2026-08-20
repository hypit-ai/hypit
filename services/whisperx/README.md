# SVML WhisperX Service

This is the trusted, warm Python process used by `@hypit/provider-whisperx-local`. It is a Runtime
deployment package, not an author-importable SVML module and not part of Core.

The service has one narrow job:

```text
canonical 16 kHz mono PCM s16 WAV
  -> faster-whisper ASR
  -> language-specific WhisperX alignment
  -> raw measured words and optional acoustic time windows
```

It does not run FFmpeg, modify the authored script, split caption cues, infer SVML Segments, cache
Build results or create a SemanticTake. Missing WhisperX word timing stays missing; the author-side
semantic projection combines this evidence with one explicit Script Segment later.

## Install

WhisperX 3.8.6 supports Python 3.10 through 3.13. The checked-in lock selects Python 3.13:

```bash
uv python install 3.13
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen hypit-whisperx-prepare
uv run --project services/whisperx --frozen hypit-whisperx-check
```

The first model start may download ASR and alignment weights. Production should put the relevant
Hugging Face cache on persistent storage. `hypit-whisperx-prepare` separately installs NLTK's
`punkt_tab` sentence data from a commit-pinned official archive after verifying its SHA-256. This
resource is required by WhisperX alignment and is never downloaded inside an inference request.

## Run

```bash
uv run --project services/whisperx --frozen hypit-whisperx-service
curl http://127.0.0.1:8765/health
```

Default identity:

```text
model       small
device      cpu
compute     int8
batch size  8
protocol    hypit.whisperx-service@1
```

Configuration is deployment state:

| Variable | Default | Meaning |
|---|---:|---|
| `HYPIT_WHISPERX_PORT` | `8765` | loopback port |
| `HYPIT_WHISPERX_MODEL` | `small` | faster-whisper model |
| `HYPIT_WHISPERX_DEVICE` | `cpu` | `cpu` or the deployed accelerator |
| `HYPIT_WHISPERX_COMPUTE` | `int8` on CPU | CTranslate2 compute type |
| `HYPIT_WHISPERX_BATCH_SIZE` | `8` | bounded ASR batch size |
| `HYPIT_WHISPERX_INPUT_ROOTS` | OS temp directory | path-separated roots the service may read |
| `HYPIT_WHISPERX_NLTK_DATA` | user SVML cache | prepared, identity-checked NLTK data root |
| `HYPIT_WHISPERX_MAX_REQUEST_BYTES` | `65536` | HTTP JSON bound |
| `HYPIT_WHISPERX_MAX_AUDIO_BYTES` | `536870912` | staged canonical WAV bound |

The Node Provider must configure the same model, device, compute, batch size, service version and
WhisperX version. A mismatch fails before transcription results are accepted.

## Queue and concurrency

The SVML Runtime Scheduler decides how many WhisperX Needs may enter this Provider lane. One service
process admits exactly one inference because its ASR/alignment models are shared process state. A
second direct request receives `503 BUSY` instead of entering a hidden service queue.
`ThreadingHTTPServer` keeps `/health` responsive while the admitted inference runs.

Run multiple service processes on different devices/ports only when the Runtime registers and
locks them as distinct Provider instances.
