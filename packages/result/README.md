# `@hypit/result`

Build Results are the current immutable history projection for one long-running Build: targets,
outcome, external-attempt evidence, logs and completed publications. Execution state belongs to
Runtime. A target is execution evidence, not an instruction to publish or store its value.

Publication is no longer a boolean `retain` decision. A producing domain names an exact publisher in
`PublicationIntent`; Runtime transports that answer but must not infer product status from value shape.
The filesystem history stores Product summaries and stable addresses beside Build evidence. Product
values, resources and publication writer state belong to the separate Product store.

## Values and file ownership

Result manifests contain no Product-relative paths. Each published entry records its Product address,
Type, publisher and representation summary. Product's own manifest contains scalar values or private
file/value-document references and owns all corresponding resource bytes.

Workspace attachments and Runtime working resources are execution inputs, not durable Result
addresses. When their bytes appear in a published Record, Product publication copies them into its
own store. A Result therefore neither owns those bytes nor keeps a live project-file dependency.

## Finished history

`PublicationIntent.outputs` supplies the published name, accepted Record and exact publisher.
Runtime records that publisher with the accepted Type rather than inventing a lifetime policy.
History exposes each Product's stable `{ publication, name }` address; the current publication identity
is the Run that closed it.
Reusing an earlier Output is an authoring
operation: export the accepted material into the project and reference it from the Author Source.
Result storage never substitutes a historical Build for an authored value.

Draft creation, incremental materialization, crash recovery and terminal publication belong to Runtime
Local. They are not Result package APIs. Runtime owns its writable filesystem implementation and
atomically publishes the same `hypit.build-result@1` document that this package later reads as
history. Private writer state disappears at the terminal outcome. Core still receives ordinary typed
Records and Resource identities; it has no knowledge of file paths or Result repositories.

Drafts are not project history. The package root exposes `BuildResultHistory`; its `read()` and
`browse()` methods return finished `BuildResult` values only. Exact Product lookup belongs to
`ProductHistory`. Runtime Local's assembly may return one object implementing both ports, but their
physical roots and readers remain separate. CLI and history browsers therefore
cannot observe, finish, discard or recover an open draft. `@hypit/result/node` exposes only
`FileBuildResultHistory` and the finished-history filesystem reader.

`ProductHistory.resolveProduct(address)` turns Product-private persistence into an ordinary domain
`Value`. Its returned `openResource()` capability can stream only Blob resources bound into that exact
Product, including a normalized byte range. Result history has no general Product or Result-relative
path opener.

A `complete` outcome is published only after every Output named by the Publication Intent has been stored.
Failed and cancelled Results may intentionally contain the subset that completed. This is a local per-Build
closure check, not a central Result index or an attempt to infer missing work.

Product file references remain scoped to one publication. Separate publications remain separate even
when their bytes happen to match; publication performs no content hashing or historical lookup.

An explicit `hypit result export` materializes one published Output at an author-selected destination.
Blob bytes and inline scalars have universal representations. A structured Type is exported through
the `hypit.product-exporter@1` facet supplied by the package that owns that Type. Product owns this
author-facing projection; Result neither exposes the private Value Document layout nor maintains a
central Type switch.

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
