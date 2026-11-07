---
title: Exact time in an NLE project
description: How direct rational placement, source time and output sampling stay separate.
---

Hypit's NLE project stores the accepted edit as direct values. It has no named Timeline object and
does not retain the expression, transcript match or generator that helped an author choose a time.

Every Item has three exact temporal values:

- `start`: where the Item begins in programme time;
- `duration`: how long it contributes;
- `localStart`: where reading begins in the Item's source or component-local time.

Each value is written as integer ticks plus a rational time base:

```json
{
  "ticks": "1001",
  "timeBase": { "numerator": 1, "denominator": 30000 }
}
```

This is exactly 1001/30000 seconds. It is not rounded to the project's display grid.

## Edit rate is a grid, not storage

`editRate` tells an editor how to display time and where frame snapping normally lands:

```json
"editRate": { "numerator": 30000, "denominator": 1001 }
```

Changing this value does not retime, quantize or reinterpret any existing Item. Media audio retains
its own sample domain, and final export chooses its own picture sampling rate.

## Placement is already resolved

A trim or move commits new exact values through one revisioned NLE transaction. A source marker,
transcript word or analysis result may be shown by an editor as a snap guide, but accepting the snap
stores the resulting value. Export never looks the guide up by name.

When linked editing is useful, the editor updates all affected direct values in the same transaction.
That is an editing operation, not a second timing authority in the saved project.

During lowering, the direct values become factual programme-to-source maps in AVIR. Components and
effects may additionally own exact Item-local controls, but their parameter format belongs to their
package rather than to NLE Core.

See [NLE project structure](./tracks.md) for Items and paint order, and
[Exporting the programme](./composition.md) for output sampling.
