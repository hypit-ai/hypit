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

## Supported hosts and prerequisites

The supported desktop baseline is:

- macOS 13 or newer;
- Windows 10 or 11, x64;
- Node.js 22 or newer.

Windows XP is not a supported target: Node.js 22, current Python and the Windows Credential Locker do
not run there. Do not claim compatibility that the platform dependencies cannot provide.

`hypit` and Node are required. `ffmpeg` and `ffprobe` are required by local media and preview paths; a
host package manager puts them on `PATH` on macOS and Linux, and a manual install puts them on `PATH`
on Windows. Credentials load from a project's `.env` in the same shell that runs the commands:
`set -a && . ./.env && set +a`.
`uv` is required only when the selected Runtime Profile uses a managed Python program such as
WhisperX or OpenCV.
`yt-dlp` is required only to reconstruct a video given as a link rather than as a file; a host package
manager or `pipx` puts it on `PATH`. `prepare_reference` names it when a link is passed without it.

When the Runtime Profile selects the local WhisperX Endpoint, verify that the service answered its
health probe before `prepare_reference` or a Build, since a first start can spend several minutes
loading the model:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8765/health
hypit programs status
hypit doctor
```

`host-setup.md` holds the host toolchain installations and repairs, and is read when a command
reports that a service or a binary is unavailable.

## Machine Program Home

Managed programs are machine-level installations, separate from both Distribution and project:

- macOS: `~/Library/Application Support/Hypit/programs/`
- Windows: `%LOCALAPPDATA%\Hypit\programs\`

WhisperX, for example, lives under `programs/whisperx/`; OpenCV under
`programs/image-opencv/`. Service process records and logs live with the program. Project Build and
Worker state remains under `<project>/.hypit/`.

Reference-video state sits beside the Distribution, at `.hypit/reference-video-tools/<reference-id>/`,
wherever the command is run from. It is keyed by the video, so two reconstructions of one file share
the observations it cost money to make; each command reports the root it used.

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
