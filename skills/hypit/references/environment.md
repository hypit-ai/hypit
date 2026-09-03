# Cross-platform environment

## Three independent places

Hypit has three different lifetimes. Never collapse them into one directory.

- The **skill** is agent guidance. A Skill hub copies the real `skills/hypit/` subtree into an Agent's
  global Skill directory so later sessions and unrelated projects can discover it.
- The **Distribution** is either an already installed machine-wide Hypit package, the machine-level
  `<home>/hypit` checkout prepared by the Skill while npm publication is unavailable, or a contributor
  checkout deliberately selected for repository work. It owns the CLI, Studio, official packages and
  packaged Python service source.
- The **project** is the author's directory. It owns Sources, assets, project-local packages,
  `hypit.runtime.json`, `.hypit/` Build state and output files.

Each project is an independent boundary. After selecting the active project, do not inspect another
author project or use anything from its `packages/` directory. Never copy, import or symlink a
project-local package across project boundaries. Resolve capabilities from the installed Distribution
or create the package inside the active project's own `packages/` directory through the local-package
workflow. Repository examples are read-only references only on routes that explicitly allow them;
they are never package dependencies.

Installing a Skill does not install the Distribution. OpenAgents and other Skill hubs own the installed
Skill copy; Hypit owns no second Skill registry and never rewrites that copy. Until the npm package is
published, the Agent prepares the Distribution checkout and its pinned dependencies once at machine
scope. The author does not clone it per project, run `npm link`, or run a service's `uv sync` by hand.

## Environment completion gate

This document must be read completely before any video-production route continues. Environment setup is
complete only when all of the following are true: a Hypit Distribution is selected; the project
directory and its package boundary are established; credentials for every capability the route will
use are resolved; the project's Runtime Profile is selected; `hypit runtime up` has finished installing
and starting every selected managed program; and every required health check passes. The local
WhisperX Endpoint is mandatory for video production and must report `Ready whisperx` (or an equivalent
successful probe).

Do not inspect media or examples, prepare or observe a reference, freeze a brief, inspect vocabulary,
write Source, preview, or Build until this checklist is complete. Do not substitute another
transcriber, defer installation, or continue from a partial or unconfirmed setup. Authentication is
part of this setup, not a later paid-build step. The explicit login-only request remains a fast path
for signing in and does not enter a production route.

## Credentials are part of environment setup

Resolve credentials immediately after selecting the Runtime Profile and before inspecting any media,
examples or references. HypiHub OAuth is the default for paid models and Gemini VLM. Check the selected
Endpoint:

```text
hypit auth status hypihub.default --runtime <hypit.runtime.json>
```

If its writable OS credential is missing, explain that browser sign-in lets Hypit use HypiHub without
copying an API key, then run the login yourself and wait for it to finish:

```text
hypit auth login hypihub.default --runtime <hypit.runtime.json>
```

Tell the author that an account without an active Hypit subscription can purchase one at
[hypit.ai](https://hypit.ai) after signing in. Do not ask the author to run the command or paste a key.
If the author explicitly asks to use their own provider key, configure that key instead and explain it
is the less-recommended path. A completed OS login is reusable across projects and later conversations
on the same machine; do not ask them to log in again when the credential is configured.

For reference analysis, strongly recommend Gemini VLM through HypiHub or Vertex: it can distinguish
speakers, align who speaks when, and extract voice/timbre and presentation traits, which improves
speaker replication and voice-design decisions. Do not use the credentialless agent observer as a way
to bypass credential setup.

## Select or prepare the Distribution

The Skill must be global. OpenAgents installs it from the repository's real `skills/hypit/` directory;
with the generic Skills CLI the equivalent command is:

```text
npx skills add hypit-ai/hypit --global
```

First try an already installed program:

```text
hypit paths --json
```

If that command is missing, do **not** run `npm install --global hypit`: the npm package is not
currently published. When the current task is repository development inside a Hypit contributor
checkout, use that checkout. For ordinary video production use `<home>/hypit` as the machine-level
Distribution. A valid checkout has all of these:

```text
package.json                  (name: "hypit")
bin/hypit.mjs
packages/reference-video-tools/bin/reference-video-tools.mjs
```

If `<home>/hypit` does not exist, clone the public repository there. If the path exists but is not the
Hypit checkout, do not overwrite or rename it; report the collision. Never create the checkout inside
the author project.

```text
git clone --branch main --single-branch https://github.com/hypit-ai/hypit.git <home>/hypit
```

At the first production turn in each conversation, fast-forward the selected checkout. Do not reset,
stash, discard or overwrite local changes. If the pull cannot fast-forward, report the exact checkout
and stop before production:

```text
git -C <distribution-root> pull --ff-only origin main
```

After the first clone or a successful pull, prepare the pinned dependencies from the Distribution
without changing the author project's working directory:

```text
corepack enable
corepack pnpm --dir <distribution-root> install --frozen-lockfile
```

Then use the Distribution entrypoints directly for the rest of the route:

```text
node <distribution-root>/bin/hypit.mjs paths --json
node <distribution-root>/packages/reference-video-tools/bin/reference-video-tools.mjs <subcommand> ...
node <distribution-root>/bin/hypit-studio.mjs --run <run> [--runtime <hypit.runtime.json>]
node <distribution-root>/bin/hypit-preview-check.mjs <run> [<hypit.runtime.json>]
```

In every reference that abbreviates these as `hypit`, `hypit-reference-video-tools`,
`hypit-studio` or `hypit-preview-check`, interpret them as the selected launchers above:

| Abbreviation | Checkout Distribution launcher |
|---|---|
| `hypit` | `node <distribution-root>/bin/hypit.mjs` |
| `hypit-reference-video-tools` | `node <distribution-root>/packages/reference-video-tools/bin/reference-video-tools.mjs` |
| `hypit-studio` | `node <distribution-root>/bin/hypit-studio.mjs` |
| `hypit-preview-check` | `node <distribution-root>/bin/hypit-preview-check.mjs` |

Do not interpret `hypit-studio` as a `studio` subcommand of `hypit`: Studio is a separate entrypoint.
Do not globally link the checkout, use `npx hypit`, or install dependencies into an author project.
Run reference-video-tool commands that share reference state from the same working directory, even
though their launcher lives in the checkout.

When a reference names `<skill-root>`, substitute the installed Hypit skill directory (the directory
containing `<skill-root>/SKILL.md` and `<skill-root>/scripts/`); it is not relative to the author's
project or checkout.

The installed Skill and the selected Distribution have separate update lifecycles. Pulling the
Distribution does not update an OpenAgents-installed Skill; existing OpenAgents users reinstall the
Skill when they want a newer workflow. Conversely, reinstalling the Skill does not replace a dirty or
diverged Distribution checkout.

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
on Windows. Credentials load before any observer or Provider probe. In a checkout task, check the
checkout root `.env` and then the project root `.env` (project values override duplicates) in the same
shell:
`set -a; [ ! -f <checkout-root>/.env ] || . <checkout-root>/.env; [ ! -f <project-root>/.env ] || . <project-root>/.env; set +a`.
When these values satisfy the selected observer/Provider, do not ask the author for them again.
`uv` is required only when the selected Runtime Profile uses a managed Python program such as
WhisperX or OpenCV.
Reconstructing a video given as a link rather than as a file needs `uv` too: `yt-dlp` is pinned under
`services/yt-dlp` and run from there, so the version is the repository's rather than the machine's.
`prepare_reference` names what is missing when a link is passed without it.

When the Runtime Profile selects the local WhisperX Endpoint, `prepare_reference` probes the service's
health itself before transcribing, because a first start can spend several minutes loading the model.
A service that does not answer is reported in the command's result with a pointer to the repair rather
than silently producing an empty transcript.

`host-setup.md` holds the host toolchain installations and repairs, and is read when a command
reports that a service or a binary is unavailable.

## Machine Program Home

Managed programs are machine-level installations, separate from both Distribution and project:

- macOS: `~/Library/Application Support/Hypit/programs/`
- Windows: `%LOCALAPPDATA%\Hypit\programs\`

WhisperX, for example, lives under `programs/whisperx/`; OpenCV under
`programs/image-opencv/`. Service process records and logs live with the program. Project Build and
Worker state remains under `<project>/.hypit/`.

Reference-video state sits beside the Distribution, at `.hypit/reference-video-tools/<reference-id>/`.
Commands may run from any directory; the tool locates this canonical state from the selected
Distribution. It is keyed by the video, so two reconstructions of one file share
the observations it cost money to make; each command reports the root it used.

This split is why opening a second project cannot install WhisperX again, and why updating the npm
Distribution does not overwrite a Python environment or a user's project-local component.

The sibling machine npm package home is:

- macOS: `~/Library/Application Support/Hypit/packages/`
- Windows: `%LOCALAPPDATA%\Hypit\packages\`

The package set is reused by later sessions and unrelated projects. When a Distribution update
changes an exact adapter dependency, the next explicit `runtime up` lets npm update that package.

## Contributor checkout

A task changing Hypit itself uses its current contributor checkout rather than `<home>/hypit`. Follow
`docs/guide/develop.md` and use the pinned pnpm version and `pnpm-lock.yaml`. A contributor checkout may
also act as the Distribution for a video-production task, but the author project is still independent:
it may live anywhere and must never be added to the Hypit workspace or linked into the checkout.

The same fast-forward rule applies when a contributor checkout is selected. Updating its repository
refreshes its CLI, packages, services, examples, docs and canonical Skill source, but does not rewrite a
separately installed OpenAgents Skill copy.

A project directory carries its own `package.json` with the runtime-safe minimum
`{ "name": "<project-name>", "version": "0.0.0", "private": true, "type": "module" }`.
`hypit check`, `plan` and `build` locate the package root by walking
up from the project until some `package.json` appears; the file is what stops that walk at the
project, so `packages/<slug>/` resolves from there rather than from whichever ancestor
directory happened to hold one. It is matched by no `pnpm-workspace.yaml` glob and adds the project
to no workspace.
