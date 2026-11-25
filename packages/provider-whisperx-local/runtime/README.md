# Hypit local WhisperX runtime

This is the trusted, warm Python process owned and shipped by `@hypit/provider-whisperx-local`.
It is Provider material, not another package, an author-importable SVML module or part of Core.

The service has one narrow job:

```text
canonical 16 kHz mono PCM s16 WAV
  -> faster-whisper ASR
  -> language-specific WhisperX alignment
  -> raw measured words and optional acoustic time windows
```

It does not run FFmpeg, modify the authored script, split caption cues, infer SVML Segments, cache
Build results or create a media-semantic bundle. Missing WhisperX word timing stays missing; the author-side
semantic projection combines this evidence with one explicit Script Segment later.

## Install

For an ordinary installed Distribution, select the local WhisperX Endpoint and run
`hypit programs prepare --endpoint <instance>` after setting `alignmentLanguages` in its Profile.
`hypit programs up --endpoint <instance>` also prepares resources and starts the service.
The Runtime creates or reconciles the cold environment in
the machine Program Home and reuses a running service across projects and sessions. The commands below are contributor/operator
diagnostics for a deliberately managed deployment:

WhisperX 3.8.6 supports Python 3.10 through 3.13; this runtime requires 3.11 or newer because its
patched dependencies (Pillow 13, filelock 4.2) no longer support 3.10. The checked-in lock selects
Python 3.13:

```bash
uv python install 3.13
uv sync --project packages/provider-whisperx-local/runtime --frozen
HYPIT_WHISPERX_ALIGNMENT_LANGUAGES="zh en" packages/provider-whisperx-local/runtime/.venv/bin/hypit-whisperx-prepare
HYPIT_WHISPERX_ALIGNMENT_LANGUAGES="zh en" packages/provider-whisperx-local/runtime/.venv/bin/hypit-whisperx-check --models
```

`hypit-whisperx-prepare` explicitly prepares the selected ASR model, language alignment weights and
NLTK sentence data. `hypit-whisperx-check --models` reads those resources without downloading.
The service loads prepared resources only. Hugging Face calls use local-files-only APIs; the
pinned WhisperX torchaudio and NLTK branches have no equivalent switch, so this dedicated inference
process replaces their downloader entry points with an error. Preparation runs in a separate process
and retains their native downloaders. These adaptations belong here, not in Runtime or Core.
The default Pyannote VAD checkpoint ships inside the pinned WhisperX wheel.

Native HF and torch caches are reused by default. An explicit model cache root selects its
`huggingface/` and `torch/` subdirectories for both preparation and inference. No receipts, hashes or
parallel resource inventory are maintained. Resource checks read model/tokenizer files and the
selected language's sentence data. The example shell paths are POSIX; Windows environments use
`.venv\Scripts\<command>.exe`.

## Run

```bash
packages/provider-whisperx-local/runtime/.venv/bin/hypit-whisperx-service
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
| `HYPIT_WHISPERX_NLTK_DATA` | user Hypit cache | selected prepared NLTK data root |
| `HYPIT_WHISPERX_ALIGNMENT_LANGUAGES` | empty | space-separated languages to prepare; no implicit downloads for others |
| `HYPIT_WHISPERX_MODEL_CACHE` | upstream caches | optional root for HF and torch model resources |
| `HYPIT_WHISPERX_MAX_REQUEST_BYTES` | `65536` | HTTP JSON bound |
| `HYPIT_WHISPERX_MAX_AUDIO_BYTES` | `536870912` | staged canonical WAV bound |

The Node Provider must configure the same model, device, compute, batch size, service version and
WhisperX version. A mismatch fails before transcription results are accepted.

The service logs ASR loading, transcription, language-model loading and word alignment where those
operations run. Completion entries include elapsed times. A loading entry means the library call
has begun reading prepared local resources; downloads appear only in preparation logs.
Transcripts and audio content are not included in these service progress entries. `/health` answers
after ASR loading; it does not report all language caches as ready. A first request can load a
prepared aligner into memory, but cannot download it.

## Preparing sentence data through a proxy

NLTK's downloader refuses a proxied request unless the operator explicitly trusts that proxy:
it cannot enforce its direct-connection address checks through a proxy. This can stop preparation
while fetching the NLTK data index, even when uv and Hugging Face downloads work.

For a proxy you trust, scope NLTK's native opt-in to the explicit preparation command:

```bash
NLTK_ALLOW_PROXIED_URLOPEN=1 hypit programs prepare --endpoint whisperx.local
```

Use your selected Endpoint instance id. On PowerShell, set `$env:NLTK_ALLOW_PROXIED_URLOPEN = "1"`
for that preparation session, then restore its previous value. The preparation process already
inherits its caller's environment; no Hypit-specific proxy flag is needed. This setting authorizes
NLTK to use the configured proxy; it neither selects a mirror nor enables inference downloads.
Without that trust choice, use a deliberately selected direct route or supply the sentence data
in the selected NLTK data directory before preparation. Hypit does not change the choice automatically.
Existing usable sentence data is read locally without refreshing the download index.

## Package preparation

Local package preparation includes `src/**/*.py` in uv's package cache inputs. Updating service code
therefore rebuilds its small wheel instead of reusing one selected only by an unchanged
`pyproject.toml`. This leaves dependency and speech-model caches intact. See
[uv's local dependency caching](https://docs.astral.sh/uv/concepts/cache/#dynamic-metadata).
This governs package installation; an already running service continues using its loaded code.

## Queue and concurrency

The SVML Runtime Scheduler decides how many WhisperX Needs may enter this Provider lane. One service
process admits exactly one inference because its ASR/alignment models are shared process state. A
second direct request receives `503 BUSY` instead of entering a hidden service queue.
`ThreadingHTTPServer` keeps `/health` responsive while the admitted inference runs.

Run multiple service processes on different devices/ports only when the Runtime registers and
locks them as distinct Provider instances.

The local Provider reconciles this packaged project through `uv sync` before a cold service start.
A passing version probe alone cannot establish that same-version checkout edits were installed;
the declared uv source cache keys decide whether the service wheel needs rebuilding. A healthy
running service remains untouched. To adopt edited service code, stop that selected helper when idle
and start it again through its Profile; restarting only the Build Worker does not reinstall Python.
