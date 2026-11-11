---
title: NLE project structure
description: Present and Adjustment Components in the composition file, with a separate Timeline View.
---

An editable Hypit programme is a strict JSON document marked `hypit.nle@1`. The file is the current
edit, not a build graph and not an undo log.

```json
{
  "format": "hypit.nle@1",
  "id": "main",
  "name": "Main edit",
  "revision": 0,
  "canvas": { "width": 1920, "height": 1080, "clearColor": "#000000" },
  "media": [],
  "tracks": [],
  "transitions": [],
  "mattes": []
}
```

A separate `hypit.nle-view@1` file references this Project and stores the editor grid, Track locks and linked-editing
Groups. Selection, playhead and zoom remain session state; thumbnails and waveforms remain rebuildable caches.

## Media and Items

The media bin points to portable Media Asset documents by project-relative path. Those manifests
record an interpreted primary file and may reference package-owned transcript, mask, object-track or
other representation files. Opening and saving the NLE does not run analysis or require the media
bytes to be online.

A picture or audio track contains direct Items with two composition roles:

- `present`: contributes a source, selected separately as `media`, package `component` or nested `composition`;
- `adjustment`: applies one package-owned Picture or Audio Component to the result accumulated below it.

Items store exact placement, trim and enablement. A Picture Present also stores an explicit rectangle
and `fill | contain | cover` fit. Audio participation is explicit rather than inferred from a neighbouring
Picture Present. Adjustments have their own range and local time, so they can be moved, trimmed and animated
without moving a Present.

Picture tracks and their Items are ordered back-to-front. This order is the paint order; track names
and ids do not secretly determine compositing.

## Packages own behavior

A Present Component, Adjustment Component, Transition or matte stores a package module symbol and JSON parameters.
Installed package code validates and executes those parameters. NLE Core does not maintain a central
Adjustment enum, keyframe language or list of draggable handles.

That boundary lets a package add a new behavior without changing the project grammar. A package may
also contribute parameter editing or Canvas handles, but those authoring affordances are optional and
are not serialized as component implementation state.

Materialized caption cues are ordinary Component Presents. The caption package owns their text and
appearance; NLE Core does not introduce a special Caption lane or retain a transcript dependency.

## Editing relations

- A Transition joins one explicit outgoing/incoming overlap.
- A matte samples one picture Item for another and is checked for dependency cycles.
- A Timeline View Group affects linked editing only and never enters lowering.
- A composition-source Present closes a child composition as an ordinary picture/audio source.

Undo and redo belong to the open document session. Saving writes only the latest project snapshot,
so reopening never has to recover a declaration graph or synchronize another timeline model.

See [Exact time](./timing.md) for the temporal fields and
[Exporting the programme](./composition.md) for the one-way lowering path.
