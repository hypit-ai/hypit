---
title: Studio Companions
description: Give a component useful timeline entities and editing controls in Studio.
---

A component draws the video. Its **Studio Companion** explains that component to the editor: which
objects appear on the timeline, what their labels mean, and which source properties can be edited.
This lets a project component offer useful controls while keeping its visual implementation reusable.

## Package it with the component

A Companion is an application contribution. Project components can ship it as a separate file and
facet in the same physical package. The official Distribution supplies its Companions through
independent packages. In both cases, Studio loads the Companions for the packages selected by the
current Source and Distribution.

The [Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-adapter/README.md)
provides the activation and interface examples. External packages import `@hypit/hypit/studio-adapter`,
compile the Companion to JavaScript, and ship it with the component. Restart Studio after changing
the installed code so the new contribution is loaded.

## Describe the author-facing objects

A Track Companion matches the component's terminal Type and authored Surface. It describes timeline
entities, labels, material previews and Inspector fields using the component's public values.
A graphic can expose its appearance, content, placement and event timing without exposing every
internal drawing value.

Studio supplies the controls and interactions. A Companion selects scalar, list or record controls
and binds them to source values. A Film Companion identifies the Film's time source and Tracks;
a Script Companion supports the source mapping needed to relocate Selection and Moment markers.
An authored ProgramSpace supports animation without a Script lane.

## Make edits meaningful

Timeline editing follows the chosen temporal relationship. Moving a shared Script event changes the
marker and its consumers. A parameter-based handle changes that authored parameter. Values with no
supported inverse remain available for inspection.

Inspector fields bind to the author values they change. A shared Recipe or Frame may affect several
uses, so the property represents that shared decision. Studio applies the edit to the corresponding
Source, recompiles the same Run, and reports an error with the previous files restored if the edit
cannot be published.

[Studio Temporal Lineage](./studio-temporal-windows.md) explains how these relationships retain their
author meaning through projection. [Studio](../quickstart/preview.md) introduces the editing interface.
