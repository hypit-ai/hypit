---
title: Hypit Studio
description: Open a satisfied Run, inspect its picture and timeline, and edit real author Sources.
---

# Hypit Studio

Hypit Studio opens one `.svrun`, traces its Film or Render target back to explainable Semantic and Track projections, and presents four regions: Source at the upper left, Preview in the center, Inspector at the upper right, and Timeline below.

Studio opens the composition selected by the Run, using project files and completed Build Outputs.
Use `<build-record>` and `satisfy` to keep the material being edited. Studio can ask the selected
Runtime Profile to perform media operations such as inspection and normalization when the Provider
supports transient authoring. Generation and Build submission use the CLI; Studio provides playback,
semantic navigation and edits to the actual Sources.

```bash
hypit-studio --run examples/ranking-football/swap-effect-banana/studio.svrun \
  --workspace examples/ranking-football/swap-effect-banana
# ➜  http://localhost:5179/
```

| Argument | Meaning |
| --- | --- |
| `--run <build.svrun>` | Run Source to open. Required. |
| `--runtime <hypit.runtime.json>` | Runtime Profile used for transient media execution and active `BuildView` information. Historical Results and `<build-record>` still come from the project Result Repository. |
| `--workspace <directory>` | Source access and writeback boundary; defaults to the Run directory. |
| `--port <number>` | HTTP port; defaults to `5179`. |

The unit of work is the Run, not an isolated `.svml`. The Run chooses the Author Source, targets and Candidates. Every Studio recompile continues to use that same Run instead of selecting another set of material in the background.

## Which Runs can open

Studio requires:

- a real Film or Render target;
- a traceable Semantic Track and display Tracks;
- explicitly selected material Candidates;
- a display closure completed by deterministic Producers and transient capabilities declared by their Providers.

Studio refuses a Run that supplies only an opaque finished movie or whose display graph still requires external generation. It edits the current author graph and Tracks; it does not reconstruct a project from final pixels.

A project file can satisfy an output directly. A result from an earlier Build can be reused through `<build-record>`:

```svml
<file id="take-1" type="@hypit/artifact@1#BlobArtifact"
  from="./assets/take-1.mp4" media-type="video/mp4"/>
<satisfy output="take-opening.video" candidate="take-1"/>
```

## The four regions

### Source

The upper-left pane shows the current Author SVML with line numbers, highlighting, synchronized selection and text editing. It is not yet a complete Source workspace; browsing related SVS, SVRun, tasks and artifacts remains under separate design review.

### Preview

The center pane uses real material and a HyperFrames picture. Structure, Frames, padding, stacking, motion and Track layout come from the same domain programs used by a Build, not from a Studio approximation.

### Inspector

The upper-right pane shows the current entity's origin, timing, operations and adapter-exposed author parameters. Writable fields carry exact Source ranges. Values without one unambiguous write target remain read-only.

### Timeline

The lower pane places Semantic Segments, Words, Selections, Moments and component Tracks in one frame domain. Clicking selects and seeks; transport, frame stepping, zoom and scrolling are available. Move and trim are enabled only when an adapter declares the gesture and Studio resolves one author target.

## How edits return to Source

Studio exposes two structured author mutations:

- timeline gestures submit `timeline.adjust`;
- Inspector fields submit `parameter.adjust`.

They follow the executed lineage selected by the Run to a real SVML or SVS preimage. Studio recompiles with the same Run after a change. It publishes the new picture only on success; on failure it restores the files and reports the domain error. It creates no hidden Build, submits no generation, and never turns a Selection into an anonymous frame span.

The complete selection, projection, consumption and writeback model is documented in [Studio Temporal Lineage](../guide/studio-temporal-windows.md).

## Sound

HyperFrames owns the picture; the media pipeline assembles programme audio at the end. Studio may play the real Speech Track audio while previewing so B-roll can be judged against speech. Visual material without explicit audio is not given sound automatically.
