# Cross-platform environment

Requirements: Node.js 22+, pnpm 10.33.x via Corepack, Python 3.10–3.13 only for local
WhisperX/OpenCV, `uv` for locked Python environments, and `ffmpeg`/`ffprobe` for local media.

macOS/Linux or Windows PowerShell:

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
node --run narratage -- services up svml.runtime.json
node --run narratage -- doctor svml.runtime.json
```

The repository owns skill discovery: `.agents/skills` is canonical, with repository-root
`.codex/skills` and `.claude/skills` links. This is checkout layout, not a skill setup operation.
