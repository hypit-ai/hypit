# Host setup

Installing and repairing the host toolchain a Hypit route depends on: FFmpeg, machine npm packages,
and Distribution updates.

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
