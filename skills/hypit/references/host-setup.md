# Host setup

Installing and repairing the host toolchain a Hypit route depends on: FFmpeg, `uv`, the managed
WhisperX service, machine npm packages, and Distribution updates.

## General machine probe

Run this skill-owned probe when diagnosing a machine:

```text
node skills/hypit/scripts/check-environment.mjs
```

## Install FFmpeg prerequisites on Windows

Install a current FFmpeg build so both `ffmpeg.exe` and `ffprobe.exe` are available on `PATH`.
The preferred machine-wide route is Winget:

```powershell
winget install --id Gyan.FFmpeg.Shared -e
ffmpeg -version
ffprobe -version
```

If Winget is unavailable, download the current essentials ZIP from
`https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip`, extract it to a stable
directory such as `C:\Tools\ffmpeg`, and add its `bin` directory (for example,
`C:\Tools\ffmpeg\bin`) to the user or machine `PATH`. Open a new PowerShell window and verify:

```powershell
ffmpeg -version
ffprobe -version
```

Do not install FFmpeg into an author project or rely on a temporary download directory; the
executables are host prerequisites shared by Hypit projects.

## Install WhisperX prerequisites on Windows

Install `uv` with the host package manager, then let `uv` install the pinned Python interpreter.
Use Windows 10 or 11 x64 in PowerShell:

```powershell
winget install --id astral-sh.uv -e
uv --version
uv python install 3.13
```

Open a new PowerShell session if `uv` is not immediately on `PATH` after the Winget install.

Windows-specific checks before provisioning:

```powershell
Get-Command uv, ffmpeg, ffprobe
uv --version
ffmpeg -version
ffprobe -version
```

If the Hypit contributor checkout already contains a host toolchain (for example under
`.tools\ffmpeg-extract\...\bin`), prepend that `bin` directory to `$env:Path` for the current
PowerShell process before running media commands. Do not copy those executables into an author
project, and do not assume that a repository-local path is visible in a new shell.

## Install WhisperX prerequisites on macOS

Install `uv` with the host package manager, then let `uv` install the pinned Python interpreter.
Use macOS 13 or newer:

```bash
brew install uv
uv --version
uv python install 3.13
```

If Homebrew is not installed, install `uv` using Astral's current official installation method;
do not improvise a Python `pip install` for this managed-program workflow.

## Let Hypit install and run WhisperX

The project Runtime Profile may select the local WhisperX Endpoint only when the author explicitly
chooses the local fallback. The default Skill path uses HypiHub's WhisperX alignment Endpoint. A
minimal local endpoint inside the
profile's `runtime.config.endpoints` is:

```json
"whisperx.local": {
  "use": "@hypit/provider-whisperx-local",
  "config": { "defaultConcurrency": 1 }
}
```

Then select and provision the Profile with the chosen Hypit launcher:

```text
hypit runtime use hypit.runtime.json
hypit runtime up
hypit runtime status
hypit doctor
```

`runtime up` owns the WhisperX installation: it creates or reuses the managed environment in the
machine Program Home, installs the locked service, prepares NLTK `punkt_tab`, starts the loopback
service on `127.0.0.1:8765`, and then starts the Worker. The first start may download the selected
Whisper and language-alignment model weights, so it can take substantially longer than later starts.
Do not run `uv sync` in an author project and do not install the `whisperx` Python package by hand.

`runtime up` printing `Ready whisperx` reports that the local service answered its health probe.

`runtime up` probes each selected program. It creates that program's environment only when absent or
unhealthy, then reuses it across projects and sessions. It never runs `uv sync` merely because a new
project or Runtime Worker started.

### The health check fails

Do not reinstall Python packages: poll rather than launching a second copy, and read
`hypit runtime logs`. The managed WhisperX log is also at
`$env:LOCALAPPDATA\Hypit\programs\whisperx\program.log`, with the service's error stream beside it
in `program.err.log`.

Verify a running service with `hypit programs status` or `hypit doctor`. If preparation fails, read
`hypit runtime logs`; for a contributor checkout only, `services/whisperx/README.md` contains the
manual `uv sync --frozen`, prepare and check commands used to diagnose the packaged service.

### The log reports a missing `torchcodec` DLL

The log may contain a `torchcodec` warning about missing `libtorchcodec_core*.dll`, especially when
the host FFmpeg build is newer than the versions supported by that optional decoder. The warning is
diagnostic only: accept the service only after `/health` answers and a real Hypit transcription
request succeeds. Do not repair it with an author-project `pip install`; keep the Runtime-managed
environment authoritative.

### NLTK `punkt_tab` was blocked by a proxy or SSRF policy

If `runtime up` reports that NLTK `punkt_tab` is missing because Python's downloader was blocked by
a proxy or SSRF policy, install the same archive from NLTK's official data repository into the
managed WhisperX data root, then run `hypit runtime up` again. Do this only for that explicit network
failure; ordinary installs stay Runtime-managed.

Windows PowerShell:

```powershell
$whisperxData = Join-Path $env:LOCALAPPDATA "Hypit\programs\whisperx\nltk_data"
$download = Join-Path $env:TEMP ("hypit-punkt-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $download | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/tokenizers/punkt_tab.zip" -OutFile (Join-Path $download "punkt_tab.zip")
New-Item -ItemType Directory -Path (Join-Path $whisperxData "tokenizers") -Force | Out-Null
Expand-Archive -LiteralPath (Join-Path $download "punkt_tab.zip") -DestinationPath (Join-Path $whisperxData "tokenizers") -Force
hypit runtime up
```

macOS:

```bash
whisperx_data="$HOME/Library/Application Support/Hypit/programs/whisperx/nltk_data"
download_dir="$(mktemp -d)"
mkdir -p "$whisperx_data/tokenizers"
curl -L "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/tokenizers/punkt_tab.zip" \
  -o "$download_dir/punkt_tab.zip"
unzip -q "$download_dir/punkt_tab.zip" -d "$whisperx_data/tokenizers"
hypit runtime up
```

## A package reports a missing optional dependency

Upstream npm dependencies follow the same machine-level lifetime as managed programs. The
Distribution ships first-party Model, Provider, component and Studio code, but not every Fontsource
family, AWS SDK, HyperFrames browser package or optional observer SDK. `runtime up` prepares only
dependencies declared by the selected Runtime adapters. An author package reports an exact command
when its own optional dependency is missing:

```text
hypit packages install @fontsource-variable/inter@5.3.0
hypit packages status @fontsource-variable/inter@5.3.0
```

These commands use npm's ordinary `package.json` in the machine package home with no Hypit lock,
receipt, digest inventory or project-local copy.

## Update an installed Distribution

Updates to an installed, published Distribution remain an explicit package-manager operation:

```text
npm outdated --global hypit
npm update --global hypit
```

Use `hypit --version` to report the installed Distribution. Check npm only when the user asks about
updates or during deliberate environment maintenance; do not add a Distribution registry request to
every route. The Hypit Skill is synchronized from the contributor checkout, when one is selected,
by the session-initialization `git pull --ff-only origin main` step.

Do not run those npm commands for a contributor checkout; update it through its repository workflow.
After updating Hypit, stop an idle Runtime Worker before the next Build so the next process loads the
new Distribution. Existing project Sources and accepted Build records remain in the project.
