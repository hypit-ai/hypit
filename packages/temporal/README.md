# `@hypit/temporal`

Common exact-time and absolute-Timeline protocol for video graphs.

The public coordinate values are:

- `TemporalInstant`: one resolved frame boundary on one Timeline;
- `TemporalWindow`: one non-empty half-open `[start, end)` interval;
- `ExactTemporalValue`: integer ticks on an exact rational time base;
- `LocalTemporalDomain`: one named finite local interval with no output sampling grid;
- `TemporalExtent`: an unpositioned exact duration; and
- `TemporalMap`: a composable piecewise target-to-source relation between named local domains.

These values contain the minimal facts needed by consumers. Their derivation—Narrative Moment,
music beat, Timeline child, literal clock position, or another source—remains in the typed graph and
the producing package. Temporal does not carry a closed source-kind union; domain packages retain
the meaning of the exact positions they project.

`subjectId` identifies each authored value for inspection. A Window has its own identity while its
endpoints retain the identities of the values from which it was composed; those three identities need
not match. It is not an ownership lock on consumers: a named Window or Instant may deliberately feed
several components. Consumers validate Timeline identity and bounds rather than requiring their own
id to match the value.

`TemporalExtent` lets an imported or generated result determine Timeline construction without making
Timeline understand media, speech, or the operation that discovered the length. It does not carry a
frame rate. The consumer resolves it on a selected Clock with one explicit `exact`, `cover`, `inside`
or `nearest` boundary rule. `cover` is the normal whole-media rule because it retains the final
partial output frame.

`TemporalMap` is a partial relation: omitted target ranges are gaps, rate zero is hold, negative rate
is reverse and `wrap` expresses loop. Composition preserves a sequence of independently meaningful
stages rather than flattening them through a registry. The relation answers where target time reads
source time; visual interpolation and audio resampling remain signal-domain responsibilities.
At a cyclic boundary, a negative-rate Map keeps the left-hand `wrap.end` representative while a
positive-rate Map keeps the right-hand `wrap.start` representative. Terminal signal consumers use
that orientation when choosing a discrete frame or sample; the Map itself remains continuous and exact.

Author syntax does not live in the main contract entry. The same owner exposes
`@hypit/temporal/markup`: declaration packages use its construction helpers, while component
surfaces use its reference-only Instant and Window resolvers.
Domain packages such as `@hypit/narrative-temporal` project their own values into these
common types. Visual, audio, caption, typography and project components receive only the completed
Instant or Window plus the Timeline they already consume.

Temporal rejects Instants outside Timeline, Windows whose endpoint Timelines or stored span disagree,
reversed or empty Windows, positions outside their local domain and invalid map pieces. It does not
clip, repair, infer meaning or perform rendering.

The package's separate `studio` entry and activation facet describe how its own Producers are
traced and inverted by Studio. The domain computations do not import Studio; the adapter uses the
Companion interface. Studio owns recursive solving and atomic writes, not the Temporal operation rules.

Author-directed editing follows the declaration that produced a value rather than asking a consumer
to invert an arbitrary projection; see [EDITING.md](EDITING.md).
