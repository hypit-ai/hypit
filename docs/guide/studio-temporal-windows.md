---
title: Studio Temporal Lineage
description: How Hypit Studio reads authored, projected and consumed time without reconstructing it.
---

# Studio Temporal Lineage

> Status: executed Point/Window lineage is implemented. Writeback is enabled only when a gesture
> has one explicit source preimage; cross-layer back-propagation remains forbidden. This does not
> define a new Core protocol.

A timeline item does not merely "have a start and end frame". Most authored Tracks begin with a
named semantic source such as a Selection, Segment or Moment, project that source into frame space,
and then consume the projected result as picture, sound, animation or an internal schedule. Studio
must preserve those three stages instead of flattening them into one anonymous rectangle.

## The three layers

### 1. Selection window

The selection window is the semantic source chosen by the author. It retains:

- the source kind: Selection, Segment, Moment or Program;
- the canonical source identity;
- its anchors on the selected Semantic Track;
- the source range of the author expression that refers to it.

For a Moment this is a point rather than a duration. A Selection is exactly one contiguous interval,
and a Moment is exactly one point. Equal frame coordinates do not make two semantic sources identical.

### 2. Projection point or window

The projection window is the result of applying the Track's temporal expression to one source. For
example, an item may use the complete Selection, begin three frames before a Moment, or run from
`segment.start + 2s` to `segment.end`. Projection includes offset evaluation, clipping to Program
Space and frame quantization.

One authored binding produces one `TemporalPoint` or `TemporalWindow` when it resolves. Activation
and terminal boundaries remain Points, including the exact `program.end` boundary; they are never
encoded as one-frame Windows. A component can combine several projected values, such as computing
disjoint reveal intervals. That relation belongs to the component's public programme or schedule,
not to a Studio guess.

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
  -> projection expression and projected Point/Window
  -> consumed entity and consumed window(s)
  -> terminal visual/audio realization
```

The links matter more than coincident frame numbers. Several Tracks may consume the same Selection;
one projected window may feed several visual and audio facets; one component may expand one outer
window into many internal windows. These are shared bindings and projections, not duplicate clips.

Studio builds this chain from the exact executed dependency closure of each selected Track. It
indexes each Temporal record, its projection Spec, source identity and direct consumer edge, then
passes that stable view to the adapter registry. Domain packages remain unaware of Studio. A
required link that is absent stays unresolved; adapters do not infer it from attribute names, Spec
type names, runtime id prefixes, labels or equal spans.

## Timeline writeback

Studio exposes two author mutations: `timeline.adjust` and `parameter.adjust`. Move and trim are
gesture payloads of the former, not additional top-level operations. The concrete write target is
resolved from the entity's executed lineage:

- a Selection-backed rectangle moves or trims that shared Selection at Script's ordered semantic
  Anchors, and every consumer follows it;
- a Moment-backed entity moves the shared Moment point, while an independently authored duration
  may still own its right edge;
- direct absolute endpoints rewrite their exact Source ranges;
- Segment, Program and component-derived schedule phases remain read-only without a declared inverse.

This is an inverse over public identities, never an inference from equal frame spans. Component
details such as Ranking reveals use attached lanes only when their Point/Window inputs were explicitly
externalized. Invalid domain input is refused and the author mutation is rolled back.
