---
title: NLE project structure
description: Media, components, effects and editing relations in the flat project file.
---

An editable Hypit programme is a strict JSON document marked `hypit.nle@1`. The file is the current
edit, not a build graph and not an undo log.

```json
{
  "format": "hypit.nle@1",
  "id": "main",
  "name": "Main edit",
  "revision": 0,
  "editRate": { "numerator": 30, "denominator": 1 },
  "canvas": { "width": 1920, "height": 1080, "clearColor": "#000000" },
  "media": [],
  "tracks": [],
  "transitions": [],
  "mattes": [],
  "groups": []
}
```

## Media and Items

The media bin points to portable Media Asset documents by project-relative path. Those manifests
record an interpreted primary file and may reference package-owned transcript, mask, object-track or
other representation files. Opening and saving the NLE does not run analysis or require the media
bytes to be online.

A picture or audio track contains direct Items. An Item is one of:

- `media`: one use of a media-bin entry;
- `component`: one package-owned visual or audible component instance;
- `compound`: a nested flat NLE project used like another source.

Items store exact placement, trim and enablement. Picture Items also store an explicit rectangle,
`fill | contain | cover` fit and an ordered effect list. Audio participation and its ordered effect
chain are explicit rather than inferred from a neighbouring picture Item.

Picture tracks and their Items are ordered back-to-front. This order is the paint order; track names
and ids do not secretly determine compositing.

## Packages own behavior

A Component, Effect, Transition or matte instance stores a package module symbol and JSON parameters.
Installed package code validates and executes those parameters. NLE Core does not maintain a central
effect enum, keyframe language or list of draggable handles.

That boundary lets a package add a new behavior without changing the project grammar. A package may
also contribute parameter editing or Canvas handles, but those authoring affordances are optional and
are not serialized as component implementation state.

Materialized caption cues are ordinary Component Items. The caption package owns their text and
appearance; NLE Core does not introduce a special Caption lane or retain a transcript dependency.

## Editing relations

- A Transition joins one explicit outgoing/incoming overlap.
- A matte samples one picture Item for another and is checked for dependency cycles.
- A Group affects selection only and disappears during lowering.
- A Compound closes a child project as an ordinary picture/audio source.

Undo and redo belong to the open document session. Saving writes only the latest project snapshot,
so reopening never has to recover a declaration graph or synchronize another timeline model.

See [Exact time](./timing.md) for the temporal fields and
[Exporting the programme](./composition.md) for the one-way lowering path.
