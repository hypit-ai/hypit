# `@hypit/result`

Build Results are the current immutable history projection for one long-running Build: targets,
outcome, external-attempt evidence, logs and completed publications. Execution state belongs to
Runtime. A target is execution evidence, not an instruction to publish or store its value.

Publication is no longer a boolean `retain` decision. A producing domain names an exact publisher in
`PublicationIntent`; Runtime transports that answer but must not infer product status from value shape.
The current filesystem history still materializes published values beside Build evidence as a migration
boundary. Separating typed products from Run history is subsequent work, not a second meaning
hidden in this package.

## Values and file ownership

| Value source | Persisted representation |
| --- | --- |
| Published `BlobRef` produced by this Build | One Product file, temporarily colocated with this Result |
| Array or object value | A Product Value Document whose `BlobRef` bindings point to colocated Product files |

Every `product-file` path is currently relative to the containing transitional Result. Product's
materializer recognizes `BlobRef` leaves independently of their domain Type or field name and writes
each Resource identity once, so a direct
published media Output and a nested use in a structured value share one file inside that Result.

Workspace attachments and Runtime working resources are execution inputs, not durable Result
addresses. When their bytes appear in a published Record, Result storage copies those bytes into
the current Result. A Result therefore neither points at another Build nor keeps a live project-file
dependency.

## Finished history

`PublicationIntent.outputs` supplies the published name, accepted Record and exact publisher.
Runtime records that publisher with the accepted Type rather than inventing a lifetime policy.
Reusing an earlier Output is an authoring
operation: export the accepted material into the project and reference it from the Author Source.
Result storage never substitutes a historical Build for an authored value.

Draft creation, incremental materialization, crash recovery and terminal publication belong to Runtime
Local. They are not Result package APIs. Runtime owns its writable filesystem implementation and
atomically publishes the same `hypit.build-result@1` document that this package later reads as
history. Private writer state disappears at the terminal outcome. Core still receives ordinary typed
Records and Resource identities; it has no knowledge of file paths or Result repositories.

Drafts are not project history. The package root exposes `BuildResultHistory`; its `read()` and
`browse()` methods return finished `BuildResult` values only. CLI and history browsers therefore
cannot observe, finish, discard or recover an open draft. `@hypit/result/node` exposes only
`FileBuildResultHistory` and the finished-history filesystem reader.

Repositories own address access. `BuildResultHistory.resolve(build, output)` turns the private
persistence representation into an ordinary domain `Value`. Its returned `openResource()` capability
can stream only Blob resources bound into that exact Output, including a normalized byte range.
Callers never receive a general Result-relative path opener. A custom repository can provide another
physical implementation without changing Result identity or publication semantics.

The manifest reports domain `type` separately from storage representation. An Output is stored inline,
as a Product file, or as a `hypit.product-value@1` document; those forms do not claim a domain value category.

A `complete` outcome is published only after every Output named by the Publication Intent has been stored.
Failed and cancelled Results may intentionally contain the subset that completed. This is a local per-Build
closure check, not a central Result index or an attempt to infer missing work.

Storage file references remain scoped to one containing Build. Separate Results remain separate even
when their bytes happen to match; publication performs no content hashing or historical lookup.

An explicit `hypit result export` materializes one published Output at an author-selected destination.
Blob bytes and inline scalars have universal representations. A structured Type is exported through
the `hypit.result-output-exporter@1` facet supplied by the package that owns that Type; Result does
not expose its private Value Document layout as an author format or maintain a central Type switch.

Published Output names are fixed by the compiler-owned Publication Intent. A finished Result is not renamed,
annotated or curated as a media catalog. Exported
material enters a new production through an ordinary Author declaration and receives its project-facing
name there.

## Execution evidence

A finished manifest may contain `executionLog`, an ordinary Result file reference separate from
`outputs`. `BuildResultWriter.finish({ executionLog, outcome, ... })` accepts a byte stream. Repositories
preserve it as `execution.jsonl` before the terminal manifest is committed. Repeating an already
completed finish does not rewrite it.

This file describes how the Build ran; it is neither an authored Output nor a gallery asset. Consumers
read it through the dedicated `openExecutionLog(build)` history operation. Its absence means no log was
recorded; readers do not reconstruct history from other projects or open arbitrary manifest paths.

`operations` records only durable external-attempt facts: the stable Need id, selected Endpoint,
explicit completion, failure or cancellation conclusions, and any Provider receipt. The same Need id
appears as `request` in the execution log, so
multiple attempts through one Endpoint remain attributable without retaining request constraints. A
Provider-accepted operation whose conclusion was not known when the Build ended has the explicit
historical outcome `unsettled`; it is not presented as terminal success or failure. Purely queued or
submitting Runtime work has no external evidence and is not copied. Runtime Operation and Command ids,
capability, acknowledgement/completion times, allocation time, capacity pools, lifecycle phase, handles,
credentials and last progress samples remain
Runtime state rather than becoming Result history.
