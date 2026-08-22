---
title: Studio Temporal Windows
description: Open design note for displaying authored, projected and consumed time in Hypit Studio.
---

# Studio Temporal Windows

> Status: the read-only presentation is decided and being implemented. Timeline writeback remains
> open. This does not define a new Core protocol.

A timeline item does not merely "have a start and end frame". Most authored Tracks begin with a
named semantic source such as a Selection, Segment or Moment, project that source into frame space,
and then consume the projected result as picture, sound, animation or an internal schedule. Studio
must preserve those three stages instead of flattening them into one anonymous rectangle.

## The three windows

### 1. Selection window

The selection window is the semantic source chosen by the author. It retains:

- the source kind: Selection, Segment, Moment or Program;
- the canonical source identity;
- its anchors on the selected Semantic Track;
- the source range of the author expression that refers to it.

For a Moment this is a point rather than a duration. A Selection is exactly one contiguous interval,
and a Moment is exactly one point. Equal frame coordinates do not make two semantic sources identical.

### 2. Projection window

The projection window is the result of applying the Track's temporal expression to one source. For
example, an item may use the complete Selection, begin three frames before a Moment, or run from
`segment.start + 2s` to `segment.end`. Projection includes offset evaluation, clipping to Program
Space and frame quantization.

One authored binding produces one projected window when it resolves. A component can combine the
projected windows of several authored children, such as computing disjoint reveal intervals. That
relation belongs to the component's public programme or schedule, not to a Studio guess.

### 3. Consumption window

The consumption window describes what the realized Track actually uses. It may equal the projected
window, but equality is not assumed. Examples include:

- a Media Item whose picture lifetime equals its projected window;
- a source-audio trim whose source samples differ from its target window;
- a Media Sequence with logical member spans, visual spans and a handoff span;
- a Ranking with one outer projected window and several reveal-consumption windows;
- an enter or exit animation whose motion occupies part of the Track item's lifetime.

Consumption is published by the domain programme, schedule, Visual Track or Audio Track. Studio
must not reconstruct it from naming conventions or reimplement a package's scheduling algorithm.

## Identity chain Studio must retain

Studio eventually needs a lossless chain with explicit identities:

```text
author element
  -> semantic binding (kind, source id, author range)
  -> projection expression and projected window
  -> consumed entity and consumed window(s)
  -> terminal visual/audio realization
```

The links matter more than coincident frame numbers. Several Tracks may consume the same Selection;
one projected window may feed several visual and audio facets; one component may expand one outer
window into many internal windows. These are shared bindings and projections, not duplicate clips.

The current Studio adapter registry is the right local place to interpret this chain. Domain
packages remain unaware of Studio. Adapters should reuse author observations and the public values
already emitted by Narrative, Temporal and each Track family. If a required link is not observable,
Studio should call it unresolved rather than infer it from ids, labels or equal spans.

## Timeline questions that remain deliberately open

Before any drag or trim writeback is enabled, the product design must decide:

1. Whether the three windows appear as nested geometry in one lane, separate linked sub-lanes, or
   an overlay revealed when an item is selected.
2. How a point-like Moment and its duration-like projection are distinguished visually.
3. How a shared Selection communicates the blast radius across all consuming Tracks.
4. Whether the playhead/inspector selects the semantic source, projected window, consumed
   entity or terminal realization, and how the user moves between those levels.
5. How component-internal schedules such as Ranking reveals expand without making the primary
   timeline noisy.
6. Which drag gesture owns which level. Moving a semantic source, changing a projection offset and
   trimming a consumption window are different edits and must never be silently substituted.

Until these questions are answered, timeline entities remain selectable and seekable but read-only.
The rule is simple: difficulty is acceptable; implicit guessing is not.
