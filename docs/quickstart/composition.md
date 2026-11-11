---
title: Exporting an NLE programme
description: Resolve files and packages, lower through AVIR, then render picture and audio.
---

The editable NLE project is deliberately not a renderer document. Preview and export derive terminal
programmes from one immutable snapshot:

```text
hypit.nle@1 project
  -> AVIR programme
       -> HTML picture programme -> Chromium frames
       -> audio programme        -> rendered audio
  -> muxed MP4
```

AVIR is the intermediate relationship layer. It carries factual occurrences, exact temporal and
spatial maps, paint order, audio mixing and package-owned operators. It has no editor tracks, undo
history, DOM or output frame rate. The HTML and audio adapters consume that same resolved programme.

## Local file export

Use the direct NLE command when the project already refers to local Media Asset files and installed
component/effect packages:

```bash
hypit nle export edit.nle.json --to output.mp4
hypit nle export edit.nle.json --to output.mp4 --frame-rate 30000/1001
```

The command validates the snapshot, loads only the named packages, resolves primary media files,
lowers picture and audio, renders them and publishes the completed MP4 without replacing an existing
output.

`--frame-rate` selects picture sampling for this delivery. It never changes the exact times stored in
the project. Without the option, export samples at 30 fps. A timeline View may keep a separate edit
grid for the UI, but that display preference never chooses an export frame rate.

This command is not an AIGC Build. It creates no Runtime Profile, Result history, semantic dependency
or durable prepare state. Generated media becomes ordinary project material only after it is exported
to files, described by a Media Asset document and inserted into the NLE through the same materializing
edit used for camera footage or a downloaded file.

## What remains editable

The `.nle.json` file remains the authority after export. AVIR, HTML, audio and rendered intermediates
are derived values and do not have to be written back. A later trim or parameter edit creates a new
project revision; the next preview or export lowers that new snapshot.

See [NLE project structure](./tracks.md) for media, Items and package instances, and
[Exact time](./timing.md) for frame-rate independence.
