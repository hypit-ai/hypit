# Author-directed time editing

Studio edits the declaration that produced an absolute time value; it does not ask the consuming
component to reverse an arbitrary projection.

The package-owned declaration compiler records an optional, data-only `author` parameter on the exact
`TemporalInstantSpec` or `TemporalShiftSpec` it creates. It names the owning binding and whether the
endpoint is direct or derived from a duration. Studio reads that fact from the executed graph; it does
not inspect component attribute names. A reference has no local parameter authority: its producer
remains the only place that may declare an inverse.

## Named absolute declarations

| Author form | Move | Leading edge | Trailing edge |
| --- | --- | --- | --- |
| `from="2s" for="8f"` | Rewrite `from`; retain `for`. | Rewrite `from` and `for` atomically so the end stays fixed. | Rewrite `for`. |
| `until="3s" for="8f"` | Rewrite `until`; retain `for`. | Rewrite `for`. | Rewrite `until` and `for` atomically so the start stays fixed. |
| `from="1s" until="3s"` | Shift both values. | Rewrite `from`. | Rewrite `until`. |
| named Window declared with `from`/`until`/`for` | Rewrite the declaration. | Rewrite its leading relation. | Rewrite its trailing relation. |
| component `during={named-window}` | Follow the referenced value. | Edit its producer. | Edit its producer. |

`from` and `until` may reference completed Instants on the named declaration. The component has no
local time constructor or parameter authority; editing follows the Window or Instant producer. A
resolved value does not grant the consumer an inverse operation over its source domain.

Frames and milliseconds are integral. Seconds may be rational decimals. Timeline conversion uses
exact arithmetic and whole frame boundaries. Unedited values retain their authored unit.

## Domain-produced values

A domain package owns its own declared inverse. `@hypit/narrative-temporal`, for example, knows that
one Instant came from a Moment or a particular Selection boundary. Music analysis could instead
trace an Instant to a beat. Both publish the same `TemporalInstant`, but their editing rules remain
with their projection declarations.

Studio can recover this relationship from the producer graph and the projection package's metadata;
the general visual/audio/text consumer needs no `semantic`, `beat`, or projector input. If several
components consume the same named value, editing its declaration updates all of them after ordinary
recompilation.

This division is intentional:

- `@hypit/timeline-author` owns absolute Clock, Timeline, Window and Instant construction;
- `@hypit/temporal` owns exact time values, relations and syntax-neutral literal parsing;
- a domain package owns projection and domain-specific writeback;
- `@hypit/temporal` validates resolved absolute values;
- the component owns only what the value means for its behavior.

There is no automatic inverse, hidden compatibility fallback, or central registry of temporal
lineage. An author package may contribute local inverse relations for the private Producers it puts
in the executed graph; Studio only composes their typed Point, Extent and Span constraints. Unsupported
or ambiguous edits remain unavailable instead of mutating a guessed source.
