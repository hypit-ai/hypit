# Production Reference Index

Choose the reference that owns the current technical question:

## Architecture & Workflows

- [`system.md`](system.md) — Project Boundary, ApplicationHost, ExecutionHost, Canvas, Media, NLE, and Publications
- [`canvas.md`](canvas.md) — Canvas boards (`*.canvas.json`), `canvas create/catalog/apply/quote/invoke/adopt`, Publication reuse
- [`execution.md`](execution.md) — Standalone Execution Host (`capabilities`, `doctor`, `quote`, `submit`, `wait`, `publication`, `resource`)
- [`studio.md`](studio.md) — NLE Studio (`hypit nle open`), Canvas Studio (`hypit canvas open`), and Desktop workflow
- [`delivery.md`](delivery.md) — Exporting video (`hypit nle export`) and delivery profiles

## SVML, Timeline & Authoring

- [`source-syntax.md`](source-syntax.md) — Complete SVML v2 markup contract (`<svml>`, `<composition>`, `<track>`, `<present>`, `<adjust>`, `<source-time>`, `<picture>`, `<process>`, `<transition>`, `<matte>`, `<group>`)
- [`authoring.md`](authoring.md) — TSX Composition Source (`@hypit/nle/authoring`) and materialization into SVML
- [`timing.md`](timing.md) — Exact rational seconds (`numerator/denominator`), `source-time`, `control-time`, speed, holds, and wraps
- [`timeline.md`](timeline.md) — Composition extent, `edit-rate`, gaps, overlaps, and nested Compositions
- [`tracks.md`](tracks.md) — Track `kind` (`picture`, `audio`), `role` (`picture`, `text`, `subtitle`, `filter`, `effect`, `audio`), paint order, and Edit Groups
- [`spatial.md`](spatial.md) — Picture canvas, `<layout>`, `fit` (`fill`, `contain`, `cover`), and `content-x`/`content-y`

## Media, Clips & Transcripts

- [`media.md`](media.md) — Project Media (`*.media.json`), adopting Publications, local media inspection, and cutouts
- [`visual-clips.md`](visual-clips.md) — Media, Component, and Composition Presents on Picture Tracks
- [`audio-clips.md`](audio-clips.md) — Audio Presents, gain, fades, and mixing
- [`script-syntax.md`](script-syntax.md) — Timed transcripts (`{ language, words }`) and `hypit transcript align`
- [`video-downloads.md`](video-downloads.md) — Downloading reference footage with `yt-dlp`
- [`image-operations.md`](image-operations.md) — Image editing, compositing, cropping, and matting

## Components, Typography & Review

- [`component-design.md`](component-design.md) — Choosing component boundaries, parameters, media slots, and value slots
- [`component-visuals.md`](component-visuals.md) — Rendering HTML visuals (`hypit.nle-render`)
- [`component-sharing.md`](component-sharing.md) — Sharing project components, Models, and Providers via npm/pnpm
- [`track-authoring.md`](track-authoring.md) — Authoring custom Track/Component packages
- [`fonts-and-text.md`](fonts-and-text.md) — Fonts, multilingual text, Emoji, and `@hypit/text-fine`
- [`caption-authoring.md`](caption-authoring.md) — Authoring custom Caption components
- [`caption-presentation.md`](caption-presentation.md) — Styling and presenting captions
- [`rendering.md`](rendering.md) — HTML/Audio program lowering and Electron GPU/frame-buffer rendering
- [`review.md`](review.md) — Inspecting and evaluating previews and exported deliverables

## Working Examples

- [`examples/production.svml`](examples/production.svml) — Valid SVML v2 timeline example
- [`examples/composition.tsx`](examples/composition.tsx) — Valid `@hypit/nle/authoring` TSX composition
- [`examples/canvas-edit.json`](examples/canvas-edit.json) — Valid `hypit canvas apply` transaction payload
