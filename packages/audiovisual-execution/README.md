# `@hypit/audiovisual-execution`

Transient demand propagation and terminal partitioning for a resolved
`@hypit/audiovisual` Programme.

AVIR remains the renderer-neutral author relation. This package starts with an
explicit output range, propagates that demand through Picture and Audio DAGs,
projects occurrence-local demand into Source-local time, and then partitions
the demanded nodes under explicit Terminal bindings. It does not select a
Provider, execute a renderer, persist a cache, or write execution facts back to
NLE/AVIR.

`AudiovisualPictureOutput` closes one invocation-local sampling grid, output
Canvas and viewport-to-Programme Picture map without selecting HTML, WebGPU or
another renderer. `createAudiovisualPictureDemand()` projects that policy into
the exact AVIR observations used by every Picture Terminal. Frame count and
positions therefore have one owner and are not reimplemented by each
compositor. The output policy remains transient and is never written into an
NLE or AVIR document.

Picture closure has three ordered application phases. First,
`prepareAudiovisualPictureExecution()` derives exact demand from AVIR and one
Output policy without selecting a Runtime. Second, the Host supplies one
explicit `AudiovisualTerminalBinding` for every demanded node to
`partitionAudiovisualPictureExecution()`. Only then do cross-Terminal edges
exist, so the Host binds their agreed representations with
`bindAudiovisualPictureExecution()`. The resulting plan is the first value that
may enter `executeAudiovisualPicture()`.

The final Picture island is not required to return `HtmlProgram`:
`executeAudiovisualPicture()` preserves the selected Terminal-owned root value,
while an application-specific delivery layer decides how to execute or encode
that value.

Terminal bindings are finite inputs to one planning request. A package or Host
may offer implementations, but the Host makes the actual invocation-local
selection; the planner never
scans packages and never falls back to another terminal. A boundary between two
bound islands produces a `DerivedRenderProductRequirement`. A terminal-owned
representation satisfying it becomes the transient `DerivedRenderProduct`.
The product is an execution edge, not a Media Asset or project object.

Each selected implementation also supplies an invocation-local
`AudiovisualTerminalCapability`. Its package-owned verifier checks the Host's
explicit node or Source binding, while its input/output representation offers
are checked on the exact derived edge after partitioning. Capabilities never
choose another Terminal or representation: a missing offer or incompatible
edge fails before Runtime execution.

The same capability explicitly lists `finalOutputs`. The binding which owns a
Programme root must offer that final signal before partitioning succeeds. A
Source-only Manim implementation therefore cannot accidentally become the
Picture root, while both the HTML compositor and GPU compositor may close
Picture with different terminal-owned programme values. This is an execution
role, not a field added to AVIR.

Execution receives `AudiovisualTerminalRuntime` values that pair each exact
capability object with the executor realizing it. A different executor cannot
reuse a same-named offer, and every Terminal owning a planned island must have
one matching Runtime before work begins.

Source access (`point`, `range`, `sequential`, `whole`) belongs to the
selected implementation binding. It is deliberately absent from
`ProgramSource`: the same authored Source may have implementations with
different execution costs. Closing a task under that binding now produces an
explicit acquisition plan. Range implementations receive the exact unioned
regions; sequential implementations receive the larger
Source-local execution span from their selected origin through the last
requested position; whole implementations receive the complete finite Source
domain. In every case the downstream product requirement remains limited to
the originally requested regions.

Planning separates Programme-local Source uses from Source-local execution
tasks. Every use retains its occurrence identity, Programme demand and the
exact Source-local image of that demand. Uses of the same typed Source output
are then unioned into one task, so two placements, trims or retimes can consume
one foreign-terminal product without making either occurrence authoritative
over Source execution. Occurrence placement, trim, loop and retime remain on
the AVIR use side.

A closed child `AudiovisualProgram` is expanded only through an explicit
`NestedProgramBinding` naming both the owning Programme and its Source. Its
demanded Picture and Audio outputs receive the already mapped Source-local
region sets; the child graph is recursively namespaced and participates in the
same terminal partition as its parent. Unbound Sources remain terminal-owned
leaves. The expander does not inspect packages, infer a child from an id, or
persist the flattened plan.

Outputs of one multi-signal Source stay in one island when the same Terminal
owns them, so a renderer can coordinate Picture and Audio without an A/V-link
special case.

Cross-island delivery has two explicit phases. First,
`bindAudiovisualExecutionProducts()` requires one opaque, terminal-owned
representation identity for every derived-product edge. Producer and consumer
are already fixed by the edge and are not repeated in the binding. It performs
no format negotiation or fallback. Then
`executeAudiovisualIslands()` follows the already planned island dependencies,
passes each transient value directly to its consumer and returns the selected
final terminal values. Each Terminal receives only its island-local nodes,
uses, Source acquisitions, inputs and outputs rather than the global plan.
Intermediate product values and final output values may use different host
types. This small local executor deliberately owns no
cache, artifact repository, filesystem layout, remote Provider, retry policy or
project mutation; a Host may wrap the same requests with those operational
policies without changing AVIR.

`projectAudiovisualPictureIsland()` closes any selected continuous Picture
island back into a valid transient AVIR Programme. An incoming graph edge
becomes a typed invocation-local `ProgramSource`; an incoming Source task keeps
its authored Source contract. The returned binding table associates those
contracts with execution Product ids. A Terminal can therefore compile an
Operator subgraph without learning about the surrounding NLE or another
renderer, and this projection is never serialized into the authored Programme.

Picture node spatial domains have one derivation in `@hypit/audiovisual` and
are reused by demand propagation, island projection and concrete terminals.
Terminals therefore cannot silently reinterpret an Operator boundary's Space.

The first concrete Picture agreement is owned by the HTML consumer and uses
the shared Media `PreparedPictureSampling`: a decodable transient Picture
source plus the ordinary `TemporalMap` from nominal Source-local time into its
stream presentation domain. The representation adds no second time algebra and
does not make the execution product a `PreparedMedia` or Media Asset.
