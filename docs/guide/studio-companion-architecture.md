---
title: Studio Companions
description: Give a component useful timeline Items and editing controls in Studio.
---

A component draws the video. Its **Studio Companion** explains that component to the editor: which
objects appear on the timeline, what their labels mean, and which source properties can be edited.
This lets a project component offer useful controls while keeping its visual implementation reusable.

## Package it with the component

A Companion is an application contribution. Project components can ship it as a separate file and
facet in the same physical package. The official Distribution supplies its Companions through
independent packages. In both cases, Studio loads the Companions for the packages selected by the
current Source and Distribution.

The [Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-companion/README.md)
provides the activation and interface examples. External packages declare and import
`@hypit/studio-companion`, compile the Companion to JavaScript, and ship it with the component.
Restart Studio after changing the installed code so the new contribution is loaded.

## Describe the author-facing objects

A Track Companion matches the component's terminal Type and authored Surface. It describes timeline
Items, labels, material previews and Inspector fields using the component's public values.
A graphic can expose its appearance, content, placement and event timing without exposing every
internal drawing value.

Studio supplies the controls and interactions. A Companion selects scalar, list or record controls
and binds them to source values. A Film Companion identifies the Film's time source and Tracks;
domain Companions can contribute mapping and evidence rows for each exact projection. A Temporal
relation Companion describes how one package's producer traces to its inputs and, where meaningful,
how an edit constrains its authored inputs. The same Timeline supports animation with no performance
media or domain projection; its authored end defines the extent.

Track-owned rules that are not occurrences belong in Inspector objects. Caption Uses, for example,
remain editable without becoming draggable Timeline Items. Independently represented child content
can still use an attached Track with its own Items.

## Make edits meaningful

Timeline editing follows the chosen temporal relationship. Studio solves the requested move or trim
through the executed relation graph and writes every required author endpoint together. Shared
upstream changes naturally update all consumers after recompilation. Values with no unique supported
inverse remain available for inspection.

Inspector fields bind to the author values they change. A shared Recipe or Frame may affect several
uses, so the property represents that shared decision. Studio applies the edit to the corresponding
Source, recompiles the same Invocation, and reports an error with the previous files restored if the edit
cannot be published.

[Timing edits in Studio](./studio-temporal-windows.md) explains how these relationships retain their
author meaning through projection. [Studio](../quickstart/preview.md) introduces the editing interface.
