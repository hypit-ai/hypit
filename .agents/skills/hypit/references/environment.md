# Cross-platform environment

## Three independent places

Hypit has three different lifetimes. Never collapse them into one directory.

- The **skill** is agent guidance. Install it globally once so later sessions and unrelated projects
  can discover the same copy.
- The **Distribution** is either an already installed machine-wide Hypit package or the Hypit
  contributor checkout the task is deliberately running from. It owns the CLI, Studio, official
  packages and packaged Python service source.
- The **project** is the author's directory. It owns Sources, assets, project-local packages,
  `hypit.runtime.json`, `.hypit/` Build state and output files.

An ordinary user does not clone the repository and does not run pnpm, Corepack, `npm link`, or a
service's `uv sync` by hand. A clone is only a contributor checkout.

## Select a Distribution; do not assume registry publication

The skill must be global; the skills CLI's default is project-local:

```text
npx skills add hypit-ai/hypit --global
```

First check for an already installed program:

```text
hypit paths --json
```

If that command is missing, do **not** run `npm install --global hypit`: the npm package is not
currently published. Check whether the current directory or one of its ancestors is a Hypit
contributor checkout. A checkout has all of these:

```text
package.json                  (name: "hypit")
bin/hypit.mjs
packages/reference-video-tools/bin/reference-video-tools.mjs
```

In that checkout, prepare dependencies only when they are absent or stale, using the contributor
workflow and the pinned lockfile:

```text
corepack enable
corepack pnpm install --frozen-lockfile
```

Then use the checkout entrypoints directly for the rest of the route:

```text
node <checkout>/bin/hypit.mjs paths --json
node <checkout>/packages/reference-video-tools/bin/reference-video-tools.mjs <subcommand> ...
```

In every reference that abbreviates these as `hypit` and `hypit-reference-video-tools`, interpret
them as the selected launchers above. Do not globally link the checkout, use `npx hypit`, or install
dependencies into an author project. Run reference-video-tool commands that share reference state
from the same working directory, even though their launcher lives in the checkout.

If neither an installed CLI nor a contributor checkout is available, report that no runnable Hypit
Distribution is present and stop. A registry install is not a recovery path.

`hypit paths --json` reports the current project boundary, project state, machine Program Home,
machine npm package home and selected Distribution. Those paths are facts; no repository locator or
environment lock is involved.

Updates to an installed, published Distribution are an explicit package-manager operation, never an
automatic mutation during authoring:

```text
npm outdated --global hypit
npm update --global hypit
npx skills update --global
```

Use `hypit --version` to report the installed Distribution. Check npm only when the user asks about
updates or during deliberate environment maintenance; do not add a registry request to every route.

Do not run those npm commands for a contributor checkout; update it through its repository workflow.
After updating Hypit, stop an idle Runtime Worker before the next Build so the next process loads the
new Distribution. Existing project Sources and accepted Build records remain in the project.

## Supported hosts and prerequisites

The supported desktop baseline is:

- macOS 13 or newer;
- Windows 10 or 11, x64;
- Node.js 22 or newer.

Windows XP is not a supported target: Node.js 22, current Python and the Windows Credential Locker do
not run there. Do not claim compatibility that the platform dependencies cannot provide.

Run this skill-owned probe from the installed skill directory when diagnosing a machine:

```text
node scripts/check-environment.mjs
```

`hypit` and Node are required. `ffmpeg` and `ffprobe` are required by local media and preview paths.
`uv` is required only when the selected Runtime Profile uses a managed Python program such as
WhisperX or OpenCV. Install `uv` with the host package manager, then let `uv` install the pinned
Python interpreter.

### Install FFmpeg prerequisites on Windows

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

### Install WhisperX prerequisites on Windows

Use Windows 10 or 11 x64 in PowerShell:

```powershell
winget install --id astral-sh.uv -e
uv --version
uv python install 3.13
```

Open a new PowerShell session if `uv` is not immediately on `PATH` after the Winget install.

### Install WhisperX prerequisites on macOS

Use macOS 13 or newer:

```bash
brew install uv
uv --version
uv python install 3.13
```

If Homebrew is not installed, install `uv` using Astral's current official installation method;
do not improvise a Python `pip install` for this managed-program workflow.

### Let Hypit install and run WhisperX

The project Runtime Profile must select the local WhisperX Endpoint. A minimal endpoint inside the
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

Verify a running service with `hypit programs status` or `hypit doctor`. If preparation fails, read
`hypit runtime logs`; for a contributor checkout only, `services/whisperx/README.md` contains the
manual `uv sync --frozen`, prepare and check commands used to diagnose the packaged service.

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

`runtime up` probes each selected program. It creates that program's environment only when absent or
unhealthy, then reuses it across projects and sessions. It never runs `uv sync` merely because a new
project or Runtime Worker started.

Upstream npm dependencies follow the same lifetime. The Distribution ships first-party Model,
Provider, component and Studio code, but not every Fontsource family, AWS SDK, HyperFrames browser
package or optional observer SDK. `runtime up` prepares only dependencies declared by the selected
Runtime adapters. An author package reports an exact command when its own optional dependency is
missing:

```text
hypit packages install @fontsource-variable/inter@5.3.0
hypit packages status @fontsource-variable/inter@5.3.0
```

These commands use npm's ordinary `package.json` in the machine package home with no Hypit lock,
receipt, digest inventory or project-local copy.

## Machine Program Home

Managed programs are machine-level installations, separate from both Distribution and project:

- macOS: `~/Library/Application Support/Hypit/programs/`
- Windows: `%LOCALAPPDATA%\Hypit\programs\`

WhisperX, for example, lives under `programs/whisperx/`; OpenCV under
`programs/image-opencv/`. Service process records and logs live with the program. Project Build and
Worker state remains under `<project>/.hypit/`.

Reference-video state joins it there, at `.hypit/reference-video-tools/<reference-id>/`, resolved
against the directory the command ran in rather than against a project boundary. Run every
`hypit-reference-video-tools` command that touches a reference from the same directory: the clips,
frames, transcript and observations one command writes are what the next one expects to find at that
relative path.

This split is why opening a second project cannot install WhisperX again, and why updating the npm
Distribution does not overwrite a Python environment or a user's project-local component.

The sibling machine npm package home is:

- macOS: `~/Library/Application Support/Hypit/packages/`
- Windows: `%LOCALAPPDATA%\Hypit\packages\`

The package set is reused by later sessions and unrelated projects. When a Distribution update
changes an exact adapter dependency, the next explicit `runtime up` lets npm update that package.

## Contributor checkout

Only someone changing Hypit itself clones the repository. A task already running from that checkout
may also use it as the Distribution when no installed CLI exists, as described above. Follow
`docs/guide/develop.md` and use its pinned pnpm version and official `pnpm-lock.yaml`. Never place an
author project or its local packages inside that checkout.

A project directory carries its own `package.json` — a name and `"private": true` is the whole file,
since nothing reads its fields. `hypit check`, `plan` and `build` locate the package root by walking
up from the project until some `package.json` appears; the file is what stops that walk at the
project, so `packages/local-<slug>/` resolves from there rather than from whichever ancestor
directory happened to hold one. It is matched by no `pnpm-workspace.yaml` glob and adds the project
to no workspace.
