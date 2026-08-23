# Cross-platform environment

## Three independent places

Hypit has three different lifetimes. Never collapse them into one directory.

- The **skill** is agent guidance. Install it globally once so later sessions and unrelated projects
  can discover the same copy.
- The **Distribution** is the globally installed `hypit` npm package. It owns the CLI, Studio,
  official packages and packaged Python service source.
- The **project** is the author's directory. It owns Sources, assets, project-local packages,
  `hypit.runtime.json`, `.hypit/` Build state and output files.

An ordinary user does not clone the repository and does not run pnpm, Corepack, `npm link`, or a
service's `uv sync` by hand. A clone is only a contributor checkout.

## Install once, reuse in every session

The skill must be global; the skills CLI's default is project-local:

```text
npx skills add hypit-ai/hypit --global
```

Check the program before installing it:

```text
hypit paths --json
```

Only when the command is missing, install the Distribution once:

```text
npm install --global hypit
```

Do not replace this with `npx hypit`, and do not reinstall it for a new project or a new agent
session. `hypit paths --json` reports the current project boundary, project state, machine Program
Home, machine npm package home and installed Distribution. Those paths are facts; no repository
locator or environment lock is involved.

Updates are an explicit package-manager operation, never an automatic mutation during authoring:

```text
npm outdated --global hypit
npm update --global hypit
npx skills update --global
```

Use `hypit --version` to report the installed Distribution. Check npm only when the user asks about
updates or during deliberate environment maintenance; do not add a registry request to every route.

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
WhisperX or OpenCV. For both services, install the interpreter once:

```text
uv python install 3.13
```

Then let the Runtime own installation and reuse:

```text
hypit runtime use hypit.runtime.json
hypit doctor
hypit runtime up
hypit runtime status
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

This split is why opening a second project cannot install WhisperX again, and why updating the npm
Distribution does not overwrite a Python environment or a user's project-local component.

The sibling machine npm package home is:

- macOS: `~/Library/Application Support/Hypit/packages/`
- Windows: `%LOCALAPPDATA%\Hypit\packages\`

The package set is reused by later sessions and unrelated projects. When a Distribution update
changes an exact adapter dependency, the next explicit `runtime up` lets npm update that package.

## Contributor checkout

Only someone changing Hypit itself clones the repository. In that checkout, follow
`docs/guide/develop.md` and use its pinned pnpm version and official `pnpm-lock.yaml`. Never place an
author project or its local packages inside that checkout.
