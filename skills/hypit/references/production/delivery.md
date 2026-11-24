# Video Delivery (`hypit nle export`)

Use `hypit nle inspect` and `hypit nle export` to verify and render a saved SVML timeline into an
MP4 deliverable inside the Project Boundary.

## Inspect before exporting

```bash
hypit nle inspect main.svml --json
```

`inspect` reports the current `projectRevision`, whether NLE Studio has unsaved live edits
(`projectDirty`), track count, and total frame extent.

## Export an MP4

```bash
hypit nle export main.svml --to exports/final.mp4
```

- `--to <path>` must be a project-relative path inside the Project Boundary and must not overwrite
  an existing file (choose a new path such as `exports/v2.mp4` or remove the old output explicitly).
- Without `--profile`, `nle export` uses the Composition's canvas `width`/`height`, the SVML
  `edit-rate`, `#000000` background, `standard` quality, and 48 kHz stereo audio.

## Custom delivery profile (`--profile`)

Pass `--profile profile.json` to override resolution, frame rate, quality (`draft` | `standard` |
`high`), background, renderer (`electron` | `chromium`), or audio format:

```json
{
  "picture": {
    "width": 1920,
    "height": 1080,
    "frameRate": { "numerator": 30, "denominator": 1 },
    "background": "#000000",
    "quality": "high"
  },
  "audio": {
    "channels": 2,
    "sampleRate": 48000
  }
}
```

When `HYPIT_ELECTRON_PATH` is configured (default in Hypit Desktop), HTML visual delivery defaults
to Electron GPU shared-texture encoding and automatically falls back to Electron offscreen
frame-buffer capture + FFmpeg if GPU shared-texture is unavailable on the host.
