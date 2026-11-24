# Project files

Read this when starting, resuming, or reorganizing a video project.

## Establish the project boundary

A Hypit **Project Boundary** is anchored by a `hypit.project.json` manifest at the project root,
alongside an ordinary `package.json` and `pnpm-lock.yaml` (or npm lockfile) that select the
installed package versions:

```json
{
  "format": "hypit.project",
  "name": "Workshop video",
  "packages": [
    {
      "name": "@hypit/text-fine",
      "catalog": ["text-fine"]
    }
  ]
}
```

When running `hypit project inspect`, `hypit nle ...`, or `hypit canvas ...` without `--project`,
the CLI walks upward from the target document or working directory to find `hypit.project.json`.
Pass `--project <directory>` when running from outside the project.

```bash
hypit project inspect
hypit project inspect /path/to/video-project --json
```

All document paths (`*.svml`, `*.canvas.json`), media references (`*.media.json`), and delivery
destinations (`--to`) must resolve inside the selected Project Boundary.

## Keep reference truth and target truth separate

A reference archive records what an existing piece does. A production records what the new piece
should do and holds its Canvas boards, Media assets, SVML timelines, and project components:

```text
project/
├── hypit.project.json           # Project Boundary manifest & package catalog selection
├── package.json                 # Installed npm/workspace packages (components, models)
├── pnpm-lock.yaml               # Locked package versions
├── main.svml                    # Primary NLE timeline document
├── main.canvas.json             # Primary Canvas AIGC board (or generation/*.canvas.json)
├── media/                       # Adopted Project Media (*.media.json + media files)
├── packages/                    # Optional project-local components, operators or models
├── exports/                     # Exported deliverables (e.g. exports/final.mp4)
├── notes/
│   ├── BRIEF.md                 # User goal, constraints, audience, spending agreement
│   ├── TREATMENT.md             # Creative direction, visual/audio plan
│   ├── ANALYSIS.md              # Reference breakdown (when adapting a reference)
│   ├── TIMELINE.md              # Timed beat/word map
│   └── PROGRESS.md              # Current status & next action while work is in progress
└── references/                  # Supplied reference footage, transcripts and frames
```

In Hypit Desktop, each conversation can contain one or more engineering project directories
(created via `hypit work create <name>`), each with its own `hypit.project.json`, `main.svml`,
and `main.canvas.json`.

## Resume and hand off cleanly

1. Inspect the Project Boundary: `hypit project inspect --json`.
2. Inspect the active Canvas board: `hypit canvas inspect main.canvas.json --json`.
3. Inspect the active NLE timeline: `hypit nle inspect main.svml --json`.
4. Read `notes/BRIEF.md`, `notes/TREATMENT.md`, `notes/PROGRESS.md`, and `FEEDBACK.json` (if present).
5. Preserve unrelated Canvas nodes, Invocations, Media, SVML tracks, and project packages.
