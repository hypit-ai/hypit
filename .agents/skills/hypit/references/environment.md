# Cross-platform environment

## Where you are

Every route runs against a Hypit checkout: the `hypit` binary loads the repository's own sources and
every `@hypit/…` package is unpublished, so the checkout is what supplies both. Find it before the
first command of any route, from this skill's own directory — the one holding the `SKILL.md` you are
reading:

```text
node scripts/locate-repository.mjs
```

It prints the checkout, and clones one into the home directory when this machine has none:

```text
repository	/Users/you/hypit
source	cwd
installed	yes
```

`source` says where that path came from: `cwd` for a working directory already inside a checkout,
`skill` for a skill installed inside one, `home` for the clone it keeps, `cloned` when it made that
clone just now, `env` for a `HYPIT_REPOSITORY` the author set. `installed no` means the workspace
install below still has to run there.

Every repository path written in these files — `.agents/skills/hypit/scripts/…`, `packages/…`,
`docs/…`, `examples/…` — is relative to the printed `repository` and to nothing else. That includes
the other scripts: run the checkout's copies. `preview-check.mjs` reaches Studio's sources through
its own position in the checkout, so that copy is the one that resolves them.

Repository maintenance commands still run from the printed checkout because they consume its own
dependencies. Authoring commands run from the external project. The `hypit` and `hypit-studio`
launchers retain that project as the workspace/package root and use the printed checkout only as the
read-only Distribution for official `@hypit/*` packages. The reference-video inspection tools read
the installed Distribution vocabulary, so invoke them from the checkout as their reference pages
show rather than moving the project there.

## Requirements

Node.js 22+, pnpm 10.33.x via Corepack, Python only for the local services — 3.10–3.13 for WhisperX
and 3.13 for OpenCV, which `uv python install 3.13` satisfies for both — `uv` for locked Python
environments, and `ffmpeg`/`ffprobe` for local media.

macOS/Linux or Windows PowerShell:

```text
node .agents/skills/hypit/scripts/check-environment.mjs
```

If the probe reports `corepack missing` (some newer Node.js distributions do not bundle it), install
a compatible release from either shell:

```text
npm install --global corepack@0.34.5
```

Then install and validate the workspace, which is what `installed no` asks for:

```text
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
npm link
pnpm check
pnpm test
```

`npm link` exposes both `hypit` and `hypit-studio`; it links the replaceable tool checkout, never an
author project into the checkout.

For managed local programs:

```text
uv python install 3.13
uv sync --project services/whisperx --frozen
uv sync --project services/image-opencv --frozen
uv run --project services/whisperx --frozen hypit-whisperx-prepare
hypit runtime use hypit.runtime.json
hypit doctor
hypit runtime up
hypit runtime status
```

Use `runtime up` for normal Build preparation: it owns the detached durable Worker and prepares the external
programs declared by the Runtime Profile. `programs up/status/down` is only the narrow external-
program view and does not manage the Worker. See `runtime.md` for the Build lifecycle.

The repository owns skill discovery: `.agents/skills` is canonical, with repository-root
`.codex/skills` and `.claude/skills` links. This is checkout layout, not a skill setup operation.
