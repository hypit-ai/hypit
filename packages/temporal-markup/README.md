# `@hypit/temporal-markup`

Shared SVML author-time projection helpers for `@hypit/temporal`. The Surface lowers authored
Selection, Segment, Moment or explicit clock expressions to ordinary Instant projections and Window
composition. A domain consumer receives the projected values and explicit ProgramSpace; it does not
locate Script words or infer a semantic source inside its renderer.

The package exports `createTemporalWindowProjection`, `createTemporalInstantProjection`, their
attribute vocabulary, and the exact duration/instant parsers. These are helpers for component
Surfaces, not standalone author tags or a new Track.

## Window forms

A Surface using the shared Window vocabulary accepts one complete form:

| Authored attributes | Meaning |
| --- | --- |
| `during="program"` | The complete program Window. |
| `during={story.segment.opening}` | A Segment's Window. |
| `during={story.selection.proof}` | A Selection's Window, including its authored endpoint affinity. |
| `at={story.moment.reveal} for="8f"` | Start at a Moment and last eight program frames. |
| `until={story.moment.reveal} for="250ms"` | End at a Moment after a span of 250 milliseconds. |
| `start="program.start" end="moment.cue" moment={story.moment.reveal}` | Compose independently authored endpoints. |

Do not combine forms: `during="program" until={...}` is not shorthand for a shortened program.
Use explicit `start` and `end` for that relationship. Expressions can reference `program.start`,
`program.end`, `selection.start`, `selection.end`, `segment.start`, `segment.end` or `moment.cue`.
Bind the corresponding `selection`, `segment` or `moment` reference attribute when an expression
uses it. An endpoint may also be an absolute duration from program start, such as `1.5s`.

Offsets use an explicit sign and duration, for example `selection.start - 2f`. Frames and milliseconds
are integers (`8f`, `250ms`); seconds may be fractional (`1.5s`). Projection preserves the expression
and its authority. Invalid or out-of-program results are errors rather than silently clipped time.

## Instant forms

An Instant consumer has a different job: an event or activation with one temporal point.

| Authored attributes | Meaning |
| --- | --- |
| `at={story.moment.reveal}` | The authored Moment. |
| `at={story.selection.proof} boundary="start"` | An explicitly chosen Selection boundary. |
| `at={story.segment.opening} boundary="end"` | An explicitly chosen Segment boundary. |
| `instant="program.start + 8f"` | A projected clock expression. |

The domain component decides what happens after that point. An answer may remain visible, a Sequence
may replace its member, or a motion may run according to its own authored schedule. Instant projection
does not impose the event's visible duration. A component whose public role requires a Script Moment
can deliberately admit only that form; consumers need not expose unrelated temporal options.

## Component boundary

The Surface supplies an author-facing `subjectId` for the actual item whose time is being projected,
separately from graph-qualified operation ids. The graph wires the resulting Instant or Window and
ProgramSpace into the consumer. Keep projection outside the domain Producer: it consumes resolved
time and implements its own schedule or state, while the shared temporal protocol retains where that
time came from. An outer lifetime and child activations are separate inputs when a component persists
between events.

Script's `@`, `~@`, close markers and Moment syntax belong to `@hypit/script`; media playback belongs
to `@hypit/media-track`; a graphic component's reveal or preset semantics belong to that component.
