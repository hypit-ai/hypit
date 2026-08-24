# `@hypit/temporal`

Focused video-domain temporal projection. It locates one authored Program, Selection, Segment or
Moment through `@hypit/semantic-track`, evaluates exact rational point expressions and projects
them into ProgramSpace.

The graph-facing protocol has two distinct results. `TemporalPointSpec -> TemporalPoint` preserves
one frame boundary, including `program.end`; `TemporalWindowSpec -> TemporalWindow` preserves a
non-empty half-open frame span. Author Surfaces emit the appropriate Spec and one `project-*-point`
or `project-*` operation. Downstream components consume the projected value and ProgramSpace; they
do not receive a Selection or Moment to locate internally.

Both results retain source identity and the authored projection expression. Studio reads those
executed records and their real consumer edges, so Point values are never disguised as one-frame
Windows and no second timing truth is reconstructed from source attribute names.

The package also provides pure sibling-window validation and triggered-stage scheduling. It defines
no Core branch, renderer behavior, media playback policy, Provider or authoring super-program.
