# `@hypit/result`

Build Results record one Build's targets and outcome, and retain the completed outputs whose
declaring packages give them a lifetime beyond that Build. Execution state belongs to Runtime. A
target is execution evidence, not an instruction to store its value.

## Values and file ownership

| Value source | Persisted representation |
| --- | --- |
| Retained `BlobRef` produced by this Build | One file owned by this Result |
| Array or object value | A Value Document whose `BlobRef` bindings point to files owned by this Result |

Every `build-file` path is relative to the containing Result. The writer recognizes `BlobRef` leaves
independently of their domain Type or field name and writes each Resource identity once, so a direct
retained media Output and a nested use in a structured value share one file inside that Result.

Workspace attachments and Runtime working resources are execution inputs, not durable Result
addresses. When their bytes appear in a retained Record, Result storage copies those bytes into
the current Result. A Result therefore neither points at another Build nor keeps a live project-file
dependency.

## Retaining accepted Records

`ResultIntent.outputs` is the single lifetime authority for Result name and the accepted Record
that owns the value in this Build. The writer retains only that current Record and records its
accepted Type. Reusing an earlier Output is an authoring
operation: export the accepted material into the project and reference it from the Author Source.
Result storage never substitutes a historical Build for an authored value.

An unfinished storage draft contains only Source, Targets and accepted retained Outputs. Outcome,
failure, operation evidence and execution log cannot appear until `finish()` publishes an immutable
stored manifest. The writer keeps only its current Result-local Resource and Value paths while storing.
Persistent Output documents contain the Result-local references they actually use; private writer
state is removed at the terminal outcome. Core still receives ordinary typed Records and Resource identities. It has no knowledge
of file paths or Result repositories. Runtime may stage input bytes for execution independently of
Result retention.

Drafts are not project history. The package root exposes `BuildResultHistory`; its `read()` and
`browse()` methods return finished `BuildResult` values only. CLI, Studio and history browsers use
that port and therefore cannot observe, finish, discard or recover an open draft. Runtime publication
and crash recovery use the deliberately separate `@hypit/result/runtime-storage` entry point, whose
`BuildResultStore.readStored()` is the only repository read that can return a draft. This is an
ownership boundary, not two competing Result models: the same draft is atomically published as the
finished historical Result. The Node filesystem adapters mirror that split:
`@hypit/result/node` exposes `FileBuildResultHistory`, while Runtime uses
`@hypit/result/runtime-storage/node`.

Repositories own address access. `BuildResultHistory.resolve(build, output)` turns the private
persistence representation into an ordinary domain `Value`. Its returned `openResource()` capability
can stream only Blob resources bound into that exact Output, including a normalized byte range.
Callers never receive a general Result-relative path opener. A custom repository can provide another
physical implementation without changing Result identity or retention semantics.

The manifest reports domain `type` separately from storage representation. An Output is stored inline,
as a file, or as a Result-local value document; those forms do not claim a domain value category.

A `complete` outcome is valid only after every retained Output named by the Result Intent has been stored.
Failed and cancelled Results may intentionally retain the subset that completed. This is a local per-Build
closure check, not a central Result index or an attempt to infer missing work.

Storage file references remain scoped to one containing Build. Separate Results remain separate even
when their bytes happen to match; retention performs no content hashing or historical lookup.

An explicit `hypit result export` materializes one retained Output at an author-selected destination.
Blob bytes and inline scalars have universal representations. A structured Type is exported through
the `hypit.result-output-exporter@1` facet supplied by the package that owns that Type; Result does
not expose its private Value Document layout as an author format or maintain a central Type switch.

Retained Output names are fixed by the compiler-owned Result Intent. A finished Result is not renamed,
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
