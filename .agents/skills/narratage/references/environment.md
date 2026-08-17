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
npm link
pnpm check
pnpm test
```

For managed local programs:

```text
uv python install 3.13
uv sync --project services/whisperx --frozen
uv sync --project services/image-opencv --frozen
uv run --project services/whisperx --frozen narratage-whisperx-prepare
narratage runtime use narratage.runtime.json
narratage doctor
narratage runtime up
narratage runtime status
```

Use `runtime up` for normal Build preparation: it owns the detached durable Worker and prepares the external
programs declared by the Runtime Profile. `programs up/status/down` is only the narrow external-
program view and does not manage the Worker. See `references/runtime.md` for the Build lifecycle.

The repository owns skill discovery: `.agents/skills` is canonical, with repository-root
`.codex/skills` and `.claude/skills` links. This is checkout layout, not a skill setup operation.
