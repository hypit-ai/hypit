# `@hypit/temporal`

Focused video-domain temporal projection. It locates one authored Selection or Moment through
`@hypit/semantic-track`, evaluates exact rational point expressions, intersects them with
ProgramSpace and returns a validated half-open frame span.

The graph-facing protocol is explicit: author surfaces publish a `TemporalWindowSpec`, the
`@hypit/temporal` component projects it once to a `TemporalWindow`, and downstream components
consume that value. A component does not receive a Selection or Moment to project internally.
The resolved value retains its source identity and authored projection alongside the frame span,
so a Studio or another consumer can trace the interval without inventing a second timing truth.

The package also provides pure sibling-window validation and triggered-stage scheduling. It defines
no Core branch, renderer behavior, media playback policy, Provider or authoring super-program.
