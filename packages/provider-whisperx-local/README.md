# @hypit/provider-whisperx-local

Trusted local Provider for the explicit `@hypit/whisperx#whisperx-transcription` capability. Its
`runtime/` directory owns the warm Python service and frozen environment used through `/health`
and `/transcribe`.

The Provider accepts only canonical 16 kHz mono PCM s16 WAV bytes produced by the separate media
projection Need. It validates those bytes and stages them unchanged. WhisperX is therefore never
allowed to hide a second ffmpeg conversion or change the speech-master clock.

WhisperX's wire response uses floating-point seconds. This adapter converts those boundaries once
to integer positions in the 16 kHz evidence-audio sample domain. It preserves WhisperX acoustic
passages but never receives or assigns authored Script Segment identities.

```ts
createLocalWhisperXProvider({
  baseUrl: "http://127.0.0.1:8765",
  expectedModel: "small",
  expectedDevice: "cpu",
  expectedCompute: "int8",
  expectedBatchSize: 8,
  defaultConcurrency: 1,
});
```

The service must be on loopback because this protocol deliberately passes a local staged path. A
future persistent remote Provider should use an Artifact URL or request payload owned by that
Provider; it is a different deployment package but must return the same
`SpeechTranscriptEvidence` type. Lambda is deliberately not the target for this warm model.

The configured model, device, compute mode and batch size are checked through `/health` before use.
This prevents a warm process with an incompatible inference configuration from accepting work.

## Choose model and hardware

The default `small` / `cpu` / `int8` is a modest-machine execution default, not a quality ranking.
For multilingual transcription with quality as the priority and suitable hardware, consider
`large-v3`. For example, an NVIDIA CUDA installation with sufficient memory can explicitly select:

```json
"whisperx.local": {
  "use": "@hypit/provider-whisperx-local",
  "config": {
    "expectedModel": "large-v3",
    "expectedDevice": "cuda",
    "expectedCompute": "float16",
    "expectedBatchSize": 4,
    "alignmentLanguages": ["zh", "en"]
  }
}
```

This is an example deployment, not a promise that every GPU has enough memory. Adjust batch size
and compute mode for the actual device. On CPU, `int8` is the practical starting point; a larger
model still takes more preparation and inference work. The packaged faster-whisper backend uses
CTranslate2: Apple Silicon does not imply CUDA or support for a PyTorch `mps` setting here.
An already ready smaller model can be useful for a short clear reference. Choose the local model
or hosted service for the actual language, material and time available rather than installing
successively larger models as a routine sequence.

`expectedModel` selects speech recognition. WhisperX separately loads the language-specific
alignment model from prepared local resources when that language is first requested. Set
`alignmentLanguages` to the language codes needed by this production before preparation. This is a
preparation demand, not a central language whitelist; already cached supported languages remain usable.
Omission prepares only ASR and sentence data, and does not imply every alignment model is installed.
A larger ASR model can improve the words
fed into alignment, but does not select a larger aligner or guarantee better timing by itself.
The health response identifies the loaded ASR configuration; it does not establish that every
language's alignment weights are cached. See [WhisperX usage](https://github.com/m-bain/whisperX#usage-)
and [faster-whisper deployment](https://github.com/SYSTRAN/faster-whisper#usage).

## Preparation and downloads

An explicit `programs up` or `runtime up` prepares and starts the selected packaged service in the
machine Program Home. Selecting an Endpoint alone does not install it. The environment is reused
across projects and sessions. The current local package and
service are trusted code; this is not a community-plugin sandbox.

`hypit paths` reports the machine `hostState`. The managed installation lives below
`<hostState>/programs/whisperx-<encoded Endpoint instance>-<encoded service host>/`, with Python in
`.venv/` and the service's NLTK data in `nltk_data/`. Both identifiers use `encodeURIComponent`;
the service host includes its port. The default service is `http://127.0.0.1:8765` and exposes
its configuration through `/health`. Inspect an existing Profile's address and expected settings
when locating that service. A custom `serviceCommand` supplies its own installation and start command.
`hypit programs prepare --endpoint <instance>` prepares the configured ASR model, requested alignment
models and sentence data without starting a process. It also works when the service is already online.
`programs up` prepares and starts the selected Programs; `programs status` reports process readiness.
Adding a language requires preparation, not a service restart, when its cache location is unchanged.
`modelCacheDirectory` optionally selects a root with `huggingface/` and `torch/` subdirectories;
relative paths resolve against the Runtime data root. Omission retains the upstream Hugging Face and
torch caches and their environment settings. Changing a running service's cache selection requires
an explicit restart when idle, just like changing its model or hardware. The managed installation
does not require a global `whisperx` shell command.

Preparation and service processes inherit the environment of the command starting them. Set download
route variables on `programs prepare` (or the preparation performed by `programs up` / `runtime up`).
Changing only a download source does not require restarting a running service using the same cache.
Cache settings must select the same resource location for preparation and the service. A running
service retains its earlier environment; arrange an idle restart when changing that location or its
inference settings. Inspect its reported configuration and logs, and account for active work.

If NLTK refuses a proxied fetch during preparation, follow the service’s
[explicit proxy preparation](./runtime/README.md#preparing-sentence-data-through-a-proxy).

Preparation commands write `install.log`; the running service writes `program.log`, with stderr in
`program.err.log` on Windows. Inspect service logs for Python model-loading and inference messages;
download messages belong to preparation's `install.log`.
`programs status` reports these files as `installationLogPath`, `logPath` and `errorLogPath` when they
exist, even before installation finishes. Preparation notices name the Python environment and selected model/language resources separately. The service logs the start and completion of ASR loading, transcription,
language-alignment model loading and alignment, with elapsed times. Downloads happen only in
preparation; startup and inference only load local resources. A missing resource fails with a
preparation instruction. Transfer details come from the underlying client during preparation.
The service health endpoint becomes available after ASR loading. A startup readiness wait expiring
can leave that process still loading. Its PID is recorded when spawned; repeated `up` observes it,
and `programs down` can stop it during loading. PID liveness and service readiness are separate facts.

Python installation, Python packages, NLTK sentence data, ASR weights and language-alignment weights
are separate downloads. `UV_PYTHON_INSTALL_MIRROR` configures a Python distribution mirror;
`HF_ENDPOINT` and `HF_HOME` configure Hugging Face access/cache. Alignment models can also come
from torchaudio's download hosts. These settings do not redirect NLTK's own downloader.

Managed installation uses `uv sync --frozen` with the distributed lockfile, including its artifact
URLs. `PIP_INDEX_URL` does not configure uv, and `UV_DEFAULT_INDEX` is an index-resolution setting,
not a general rewrite of those frozen URLs. Inspect the actual transfer destination. For blocked
locked downloads, use an appropriate network/proxy route or an already populated compatible cache;
an operator-managed installation can instead provide `serviceCommand` with the expected service
identity. Ordinary production keeps the distributed dependency selection intact.
