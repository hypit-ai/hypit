# @hypit/provider-whisperx-local

Trusted local Provider for the explicit `@hypit/whisperx#whisperx-alignment` capability. It talks to
the warm Python service in `services/whisperx` through `/health` and `/transcribe`.

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
`AlignedTranscriptEvidence` type. Lambda is deliberately not the target for this warm model.

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
    "expectedBatchSize": 4
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
alignment model when that language is first requested. A larger ASR model can improve the words
fed into alignment, but does not select a larger aligner or guarantee better timing by itself.
The health response identifies the loaded ASR configuration; it does not establish that every
language's alignment weights are cached. See [WhisperX usage](https://github.com/m-bain/whisperX#usage-)
and [faster-whisper deployment](https://github.com/SYSTRAN/faster-whisper#usage).

## Preparation and downloads

The Runtime installs and starts the packaged service in the machine Program Home when this Endpoint
is selected. The environment is reused across projects and sessions. The current local package and
service are trusted code; this is not a community-plugin sandbox.

`hypit paths` reports the machine `hostState`. The managed installation lives below
`<hostState>/programs/whisperx-<encoded Endpoint instance>-<encoded service host>/`, with Python in
`.venv/` and the service's NLTK data in `nltk_data/`. Both identifiers use `encodeURIComponent`;
the service host includes its port. The default service is `http://127.0.0.1:8765` and exposes
its configuration through `/health`. Inspect an existing Profile's address and expected settings
when locating that service. A custom `serviceCommand` supplies its own installation and start command.
`hypit programs status` checks the Programs selected by the supplied Profile; `programs up` prepares
and starts them. The managed installation does not require a global `whisperx` shell command.

Preparation and service processes inherit the environment of the command starting them. Set
network and cache variables there before `programs up` or `runtime up`. A service already running
retains its earlier environment. Inspect its reported log before deciding whether a selected
Program needs restarting, and account for active work using it.

Preparation commands write `install.log`; the running service writes `program.log`, with stderr in
`program.err.log` on Windows. Inspect the stderr file for Python model-loading and download messages.
The service health endpoint becomes available after ASR loading. A startup readiness wait expiring
can leave that process still loading; check its reported PID and logs before starting another process.

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
