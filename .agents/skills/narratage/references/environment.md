# Cross-platform environment

Requirements: Node.js 22+, pnpm 10.33.x via Corepack, Python 3.10–3.13 only for local
WhisperX/OpenCV, `uv` for locked Python environments, and `ffmpeg`/`ffprobe` for local media.

macOS/Linux or Windows PowerShell:

```text
node .agents/skills/narratage/scripts/check-environment.mjs
```

If the probe reports `corepack missing` (some newer Node.js distributions do not bundle it), install
a compatible release from either shell:

```text
npm install --global corepack@0.34.5
```

Then install and validate the workspace:

```text
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

For managed local services:

```text
uv python install 3.13
uv sync --project services/whisperx --frozen
uv sync --project services/image-opencv --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
node --run narratage -- doctor svml.runtime.json
node --run narratage -- runtime up svml.runtime.json
node --run narratage -- runtime status svml.runtime.json
```

Use `runtime up` for normal Build preparation: it owns the detached durable Worker and the external
programs declared by the Runtime Profile. `services up/status/down` is only the narrow external-
program view and does not manage the Worker. See `references/runtime.md` for the Build lifecycle.

After intentionally installing, removing or changing selected packages, refresh both explicit
project locks in one reviewed action:

```text
node --run narratage -- packages sync build.svrun --runtime svml.runtime.json
```

This command derives Author roots from that Run/Author Source closure and Runtime roots from the
Profile's explicit `use` entries, then records the exact installed closures. It does not install
packages, discover a default set or mutate SVML/Run intent.

The repository owns skill discovery: `.agents/skills` is canonical, with repository-root
`.codex/skills` and `.claude/skills` links. This is checkout layout, not a skill setup operation.
