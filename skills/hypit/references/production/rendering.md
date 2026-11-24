# Composition Lowering and Rendering (`rendering.md`)

Read this when understanding how Hypit compiles an SVML composition into video and audio, configures Electron rendering backends, or diagnoses render failures. [Delivery](delivery.md) owns `hypit nle export` and delivery profiles; [Review](review.md) owns judging the rendered output.

## From SVML to Video and Audio

When you preview in NLE Studio (`hypit nle open`) or export (`hypit nle export`), the NLE delivery pipeline lowers the root `<composition>` of your `.svml` file into two deterministic terminal programs:

1. **`HtmlProgram` (`@hypit/html-program`)**: lowers every enabled `<track kind="picture">`—media video/image Presents, HTML components (`hypit.nle-render`), effects, transitions, mattes, and nested compositions—into a single self-contained, frame-addressed HTML document with explicit source-frame sampling plans and bundled artifacts.
2. **`AudioProgram` (`@hypit/audio-program`)**: lowers every enabled `<track kind="audio">`—speech, music, ambience, and SFX Presents with `<source-time>`, `<gain>`, `<fade-in>`, and `<fade-out>`—into a deterministic stereo audio mix.

Because both NLE Studio preview and headless export execute the same lowered `HtmlProgram` and `AudioProgram`, what you inspect at a frame in Studio matches the exported file.

## Local Electron Capture and Fallback Backends

Hypit renders `HtmlProgram` frames locally through Electron (`@hypit/html-electron-local`, Electron 45+):

- **Default GPU shared-texture backend (`electronHtmlBackend`)**: renders frames via Electron's hardware-accelerated shared-texture pipeline for maximum throughput.
- **Automatic frame-buffer fallback (`electronHtmlFrameBackend`)**: if GPU shared textures are unavailable on the host (for example, certain Windows GPU drivers, headless servers, or virtual machines), Hypit automatically falls back to Electron offscreen frame-buffer capture.
- **Muxing and encoding**: captured video frames and the rendered `AudioProgram` stem are encoded and muxed by `ffmpeg` into the target `.mp4` according to the selected delivery profile.

Required host executables (`HYPIT_ELECTRON_PATH`, `HYPIT_FFMPEG_PATH`, `HYPIT_FFPROBE_PATH`) are covered in [Local Tools](../environment/local-tools.md).

## Keeping Renders Fast and Deterministic

- **Check structure before exporting**: run `hypit nle inspect <file.svml>` first so broken media paths, invalid rational timestamps, or invalid component parameters fail immediately without starting Electron.
- **Preview in NLE Studio before full export**: scrubbing in `hypit nle open` reuses the mounted `HtmlProgram` document via `seekFrame`, making layout, typography, and timing iteration near-instant.
- **Avoid external network dependencies at render time**: every font, image, and video referenced by a component should be a local project file or declared `<media-input>` / artifact. Missing local assets or broken image/font loads fail capture explicitly rather than silently rendering broken frames.
- **Match frame rates cleanly**: set `edit-rate` on `<svml>` (for example `30/1` or `24/1`) to match your target delivery profile so rational clip boundaries land cleanly on output frames.
