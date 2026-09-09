---
title: Hypit Studio
description: Explore a composition, its Sources and Results, and edit its timing and appearance.
---

# Hypit Studio

Studio opens an editable video project in the browser. Play the composition, move through its
frames, select words or graphics on the timeline, and change the properties a component exposes.
It is also a useful way to hand over a finished project alongside the exported video.

## Open the work you want to edit

```bash
cd /path/to/my-video
hypit studio --run build.svrun
```

Open the address printed by the command. Studio uses the Author Source and material selected in
that Run. To keep generated material while editing, select completed Outputs with
[`build-record` and `satisfy`](./run.md#reusing-results).

| Argument | Use |
| --- | --- |
| `--run <file.svrun>` | Select the Run to open. |
| `--runtime <profile.json>` | Select a Runtime Profile; otherwise use the project's saved Runtime selection. |
| `--workspace <directory>` | Set the project boundary for Source access and edits. |
| `--port <number>` | Request a browser-server port; the default is `5179`. |

The selected target must lead to one Film and its time source. A spoken performance supplies a
SemanticTrack; an animation can supply an authored ProgramSpace. Both support visual components and
property editing. The material needed to display the composition must already be available through
the Run. Studio can perform media preparation supported by the selected Runtime; submit generation
and encoded renders through `hypit build`.

## Explore the project

The library at the left has three views:

- **Source** lists the selected Run and its Author and Recipe files. Select a file to inspect or edit it.
- **Tasks** shows completed project Builds and, with a selected Runtime, active execution information.
- **Artifacts** lets you inspect public files retained in Build Results.

Choosing an Artifact opens it for inspection. To use it in the composition, update the Run's
Candidate selection. This keeps the material choice in the editable project.

## Picture, timeline and Inspector

The central Preview draws the composition with HyperFrames. It uses the same component layout,
media sampling and motion as an encoded render. Check the actual picture when adjusting caption
placement, graphic emphasis or coverage.

The Timeline shows component appearances on a shared clock. A semantic composition also shows
Segments, Words, Selections and Moments. Select an entity to seek to it; playback, frame stepping,
zoom and scrolling help examine a particular transition or layout.

The Inspector shows the selected entity's properties. Editable fields and timeline handles depend
on the component's **Studio Companion**, which describes the component to Studio. A project component
can supply its own Companion alongside its rendering code. Renderability and the available editing
controls are separate: a field or gesture needs a clear source value to change.

## Make an edit

Source edits change the selected `.svml`, `.svs` or `.svrun` file. Supported Inspector changes and
timeline gestures write to the corresponding author value, then recompile the same Run.
Moving a shared Selection or Moment changes its position in the Script, so all consumers follow
that change. Editing a shared Frame or Recipe can likewise affect several appearances.

Check the save status after an edit. If recompilation fails, Studio reports the error and restores
the previous files. Use Apply or Reset for a structured Inspector draft. The Run and loaded Source
files are watched; restart Studio after changing installed packages, component code or Runtime
selection so those changes are loaded too.

## Sound and delivery

Preview playback includes the AudioTracks selected in Film, such as speech, music and effects.
The exported video's audio is assembled by the render's media pipeline. Deliver the encoded video;
Studio lets the recipient explore the editable composition as well.

For component authors, [Studio Temporal Lineage](../guide/studio-temporal-windows.md) explains semantic
editing, and the [Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-adapter/README.md)
explains how to expose component entities and controls.
