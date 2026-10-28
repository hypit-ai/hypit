# `@hypit/result`

Build Results retain accepted public Outputs and the attempt's final outcome. Execution state belongs
to Runtime. A Result records which value satisfied each Output; a new Output record does not imply a
new media file.

## Values and file ownership

| Value source | Persisted representation |
| --- | --- |
| `BlobRef` published by this Build | One file owned by this Result |
| Array or object value | A Value Document whose `BlobRef` bindings point to files owned by this Result |

Every `build-file` path is relative to the containing Result. The writer recognizes `BlobRef` leaves
independently of their domain Type or field name and writes each Resource identity once, so a direct
public media Output and a nested use in a structured value share one file inside that Result.

Workspace attachments and Runtime working resources are execution inputs, not durable Result
addresses. When their bytes appear in a published Record, Result publication copies those bytes into
the current Result. A Result therefore neither points at another Build nor keeps a live project-file
dependency.

## Publishing accepted Records

`PublicationIntent.outputs` is the single publication authority for public name, Logical Output,
public Type, target membership and the accepted Record that owns the value in this Build. The writer
publishes only that current Record and verifies its Type. Reusing an earlier Output is an authoring
operation: export the accepted material into the project and reference it from the Author Source.
Result storage never substitutes a historical Build for an authored value.

The Result writer keeps only its current Result-local Resource and Value paths while publishing.
Persistent Output documents contain the Result-local references they actually use; private writer
state is removed at the terminal outcome. Core still receives ordinary typed Records and Resource identities. It has no knowledge
of file paths or Result repositories. Runtime may stage input bytes for execution independently of
Result publication.

Repositories own address access. `openFile` streams one Result-local file or byte range. A custom
repository can provide another physical implementation without changing Result identity or publication
semantics.

`describeOutput` reports domain `type` separately from storage `representation`. The representation is
`inline`, `file`, or `value-document`; it does not claim a domain value category.

A `complete` outcome is valid only after every target named by the Publication Intent has been published.
Failed and cancelled Results may intentionally retain a partial Output set. This is a local per-Build
closure check, not a central Result index or an attempt to infer missing work.

`fileReferenceIdentity` identifies one containing Build and relative path. Separate Results remain
separate even when their bytes happen to match; publication performs no content hashing or historical lookup.

An explicit `hypit get` export collects the selected Output's referenced bytes into its destination.
Value-document exports rewrite bindings into the chosen export directory. Both the Result and the
explicit export are self-contained.

Published Outputs can carry an optional author `displayName` for browsers such as Studio.
It is presentation text only: Output names and file ownership do not change.

`updatePresentation` accepts `outputDisplayNames`, keyed by exact public Output name. Each
nonempty string sets that Output’s `displayName`; null removes it. Like title and note editing,
this applies to finished Results and preserves all values, file references and Output identifiers.

## Execution evidence

A finished manifest may contain `executionLog`, an ordinary Result file reference separate from
`outputs`. `BuildResultWriter.finish({ executionLog, outcome, ... })` accepts a byte stream. Repositories
preserve it as `execution.jsonl` before the terminal manifest is published. Repeating an already
completed finish does not rewrite it.

This file describes how the Build ran; it is neither an authored Output nor a gallery asset. Consumers
read it with `openFile(build, manifest.executionLog)`. Its absence means no log was recorded, including
Results made before logging was available; readers do not reconstruct history from other projects.
