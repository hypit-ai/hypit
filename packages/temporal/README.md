# `@hypit/temporal`

Runtime protocol for projected video time.

The public values are `TemporalInstant` and `TemporalWindow`. An Instant retains its runtime source,
exact projection expression, resolved ProgramSpace frame and author authority. A Window is composed
from two independently traced Instants; it has no synthetic single source.

Every source names its exact `ProgramSpace` and `Narrative`, and every projection retains the
consumer's public domain identity as `subjectId`. These are public provenance fields, not generated hashes
or editor metadata. A graph-qualified projection `id` and its author-facing `subjectId` are separate
on purpose.

Author syntax does not live here. `@hypit/temporal-markup` lowers SVML timing forms into ordinary
Instant projection and Window composition operations. The graph supplies ProgramSpace separately;
domain components receive only ProgramSpace plus the resulting Instant or Window and never locate a
Selection, Segment or Moment themselves.

Every official consumer verifies the projection at its public boundary: `subjectId` must name the
domain object being built, both endpoints must retain one ProgramSpace/Narrative, and that identity
must equal the explicitly supplied ProgramSpace. ProgramSpace is therefore an ordinary graph input
to the consumer, not ambient renderer state.

Temporal rejects Instants outside ProgramSpace and Windows that are reversed or empty. It does not
clip or repair author time. The package also provides sibling-window validation and triggered-stage
scheduling, but no renderer, Provider, media policy or Studio behavior.
