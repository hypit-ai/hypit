---
title: Hypit Studio
description: Explore a composition, its Sources and Results, and edit its timing and appearance.
---

Studio opens an editable video project in the browser. Play the composition, move through its
frames, select words or graphics on the timeline, and change the properties a component exposes.
Switch to **Comments** for a larger picture and timestamped feedback. Both views work before export.

## Open the work you want to edit

```bash
cd /path/to/my-video
hypit studio --source main.svml --target final.video
```

Open the address printed by the command. A recurring Invocation may instead be opened with
`hypit studio --invocation build.svrun`. Both forms create the same in-memory Invocation. To keep
generated material while editing, export the accepted Output into the project and make the durable
choice in the Author Source as described in [Reusing produced work](./run.md#reusing-produced-work).

The **globe menu**, to the left of **Studio / Comments**, selects the interface language.
English and Simplified Chinese are included. The first visit follows your browser language;
later visits remember your choice. Switching preserves the playhead, selection and comment draft.
It changes the interface, while your Script, video captions and comments keep their own content.

| Argument | Use |
| --- | --- |
| `--source <file.svml>` | Select the Author Source; repeat `--target <output>` for its Invocation. |
| `--invocation <file.svrun>` | Open an optional saved Invocation instead of direct Source options. |
| `--runtime <profile.json>` | Select a Runtime Profile; otherwise use the project's saved Runtime selection. |
| `--project <directory>` | Set the project boundary for Source access and edits. |
| `--port <number>` | Request a browser-server port; the default is `5179`. |

The selected target must lead to one Film and its Timeline. Prepared media can establish Timeline
extent, and optional semantic projection can add Script anchors when the composition uses them. An
animation can use a Timeline with an explicit end and no performance media. Both support visual
components and property editing. Durable material needed to display the composition belongs in the
Author Source. Studio can perform media preparation supported by the selected Runtime; submit generation
and encoded renders through `hypit build`.

## Review together in Comments

Open the printed URL ending in `#comments` to watch the current composition with a notes column.
Click the picture to play or pause, then leave a comment at the selected time. Clicking a saved note
returns to that frame. Notes appear in time order; their numbers follow submission order.

Comments are saved in the project's `FEEDBACK.json`. You and your Agent can read, edit and mark them
complete. Sending a note saves it; tell your Agent when the feedback is ready to work through.
Switch to **Studio** to explore the timeline, Sources, Results and the controls components expose.
Opening either view does not encode a video or submit an export Build.

## Explore the project

The library at the left has three views:

- **Source** lists the Author closure and an optional saved Invocation Source. Select a file to inspect or edit it.
- **Tasks** shows completed project Builds and, with a selected Runtime, active execution information.
- **Artifacts** lets you inspect public files retained in Build Results.

Choosing an Artifact opens it for inspection. To use it in the composition, export it into the
project, declare it in the Author Source and record the durable realization choice there.

## Picture, timeline and Inspector

The central Preview evaluates the composition's compiled `HtmlProgram`. It uses the same component layout,
media sampling and motion as an encoded render. Check the actual picture when adjusting caption
placement, graphic emphasis or coverage.

The Timeline shows component appearances on a shared clock. Domain projections can also contribute
mapping and evidence rows, while resolved named Instants share a locator row. Window intervals are
shown by the Track Items that use them. Select an Item to seek to it; playback, frame stepping,
zoom and scrolling help examine a particular transition or layout.

The Inspector shows the selected Item's properties. Editable fields and timeline handles depend
on the component's **Studio Companion**, which describes the component to Studio. A project component
can supply its own Companion alongside its rendering code. Renderability and the available editing
controls are separate: a field or gesture needs a clear source value to change.

## Make an edit

Source edits change the selected `.svml`, `.svs` or optional `.svrun` file. Supported Inspector changes and
timeline gestures write to the corresponding author value, then recompile the same Invocation.
Moving a shared Selection or Moment changes its position in the Script, so all consumers follow
that change. Editing a shared Frame or Recipe can likewise affect several appearances.

Check the save status after an edit. If recompilation fails, Studio reports the error and restores
the previous files. List and record controls save complete, valid values when editing ends and show
a completion hint for incomplete values. The optional Invocation Source and loaded Author Sources
files are watched; restart Studio after changing installed packages, component code or Runtime
selection so those changes are loaded too.

## Sound and delivery

Preview playback includes the AudioTracks selected in Film, such as speech, music and effects.
The exported video's audio is assembled by the render's media pipeline. When the composition is
ready for delivery, run its export Build to create the encoded video. Studio and Comments remain
available to explore the editable work and discuss further changes.

For component authors, [Timing edits in Studio](../guide/studio-temporal-windows.md) explains semantic
editing, and the [Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-companion/README.md)
explains how to expose component Items and controls.

To add another interface language, load a local JSON translation with `--locale-pack ./language.json`.
The [localization guide](https://github.com/hypit-ai/hypit/blob/main/packages/studio/LOCALIZATION.md)
explains translation files, checking missing entries and sharing a language pack.
