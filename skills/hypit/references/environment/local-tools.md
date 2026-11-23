# Local Tools and Rendering Runtime

Read this when troubleshooting local media inspection, audio/video muxing, or HTML visual rendering.

## Required local tools

Hypit local delivery (`@hypit/media-local` and `@hypit/html-video-local`) uses:

| Tool | Purpose | Environment override |
| --- | --- | --- |
| **FFmpeg** | Decoding source video, audio mixing, encoding/muxing MP4 deliverables | `HYPIT_FFMPEG_PATH` |
| **FFprobe** | Probing media dimensions, frame rates, streams, and durations | `HYPIT_FFPROBE_PATH` |
| **Electron (45+)** | Primary HTML visual renderer (GPU shared-texture with automatic software frame-buffer fallback) and single-frame capture | `HYPIT_ELECTRON_PATH` |
| **Chromium** *(optional)* | Optional fallback when `HYPIT_ELECTRON_PATH` is not configured | `HYPIT_CHROME_PATH` |

In **Hypit Desktop**, FFmpeg, FFprobe, and Electron are pre-configured automatically (Desktop
reuses its own Electron binary via `HYPIT_ELECTRON_WORKER`, with no separate Chromium download
required).

## GPU shared-texture and automatic software fallback

When `HYPIT_ELECTRON_PATH` is configured (and `HYPIT_CHROME_PATH` is unset):

1. **Video delivery (`hypit nle export`)** defaults to Electron GPU shared-texture encoding for
   high throughput.
2. If the host lacks a compatible GPU, runs in a VM, lacks shared-texture support, or renders
   transparent alpha frames, `@hypit/html-video-local` **automatically falls back** to Electron's
   standard offscreen frame-buffer capture (`electronHtmlFrameBackend`) + FFmpeg software encoding.
3. **Single-frame capture and preview** also run through `electronHtmlFrameBackend` using the same
   Electron executable.

## Troubleshooting local tools

- Verify media tools from the shell: `ffmpeg -version` and `ffprobe -version` (or inspect the
  configured `HYPIT_FFMPEG_PATH` / `HYPIT_FFPROBE_PATH`).
- If a media file fails adoption or probing, inspect its streams with `ffprobe -v error -show_format -show_streams -of json <file>` before editing.
- Keep local tool caches and installations outside the video project directory.
