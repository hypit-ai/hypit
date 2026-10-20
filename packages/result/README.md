# `@hypit/result`

Build Results retain accepted public Outputs and the attempt's final outcome. Execution state belongs
to Runtime. A Result records which value satisfied each Output; a new Output record does not imply a
new media file.

## Values and file ownership

| Value source | Persisted representation |
| --- | --- |
| New Resource without an existing durable address | One file owned by this Build |
| Explicit Workspace file | `external-file` with the Workspace's URI |
| Resource from an earlier Result | `build-file` with its original `build` and `path` |
| Entire earlier public Output | `build-output` pointing to its terminal Build and Output |
| Composite value | A Value Document whose Resource bindings follow the same rules at every depth |

A local `build-file` omits `build` when its owner is the containing Result. When imported into another
Build, its owner becomes explicit. Arrays and nested objects do not change ownership: a new Composite
can save new structure while referencing old video, audio and images. Only newly produced Resources
get new files. The encoder recognizes Resource values, independently of their domain Type or field name.

An `external-file` stays live. Replacing that file changes subsequent reads; deleting it leaves an
unavailable dependency. The stored size describes the file when admitted; `describeFile` and public
Output resolution obtain its current size. Readers use the explicit address without searching for
alternatives or comparing file contents.

## Passing references through execution

Workspace attachments may supply a `location` URI. The Node compiler preserves it, and the CLI maps
these addresses and explicitly imported Result files to the compilation's Resource identities. It
passes that map as `BuildResultSeed.resourceReferences` alongside the compiler's immutable
`PublicationPlan`.

`PublicationPlan.outputs` is the single publication authority for public name, Logical Output,
public Type, target membership and source ownership. Type describes what is published; source only
describes where this Build obtains that value. A source is either the current Build's accepted Record
or an exact historical `(Build, public Output)` address. The repository normalizes only those
explicitly selected historical addresses to their terminal owner; it does not scan Results or infer
reuse. Current Records and historical terminal Outputs must both match the publication Type before
they can be written.

The Result writer keeps this per-Build map in its private writer state while publishing. It uses the
map for both direct Resource Outputs and all nested Resource bindings. Persistent Output documents
contain the references they actually use; private writer state is removed at the terminal outcome.
Core still receives ordinary typed Records, Candidates and Resource identities. It has no knowledge
of file paths or Result repositories. Runtime may stage input bytes for execution independently of
Result publication.

Repositories own address access. `describeFile` obtains metadata and `openFile` streams bytes or a byte
range. The current Node repository is filesystem-backed and accepts `ExternalFileAccess` for external
addresses; its default opens Workspace `file:` URIs. A custom repository or address reader can provide
another physical implementation without changing Result identity or publication semantics.

`describeOutput` reports domain `type` separately from storage `representation`. The representation is
`inline`, `file`, or `value-document`; it does not claim that the domain value is intrinsically a
Scalar, Resource, or Composite. Forwarding remains hidden behind this resolved description.

A `complete` outcome is valid only after every target named by the Publication Plan has been published.
Failed and cancelled Results may intentionally retain a partial Output set. This is a local per-Build
closure check, not a central Result index or an attempt to infer missing work.

`fileReferenceIdentity` identifies the explicit URI or owning Build and path. Studio uses this identity
to group multiple uses of a file. Separate files remain separate even when their bytes happen to match.

An explicit `hypit get` export collects the selected Output's referenced bytes into its destination.
Composite exports rewrite bindings to local files, including references with different owners but the
same relative filename. This makes that export self-contained; ordinary Build publication preserves
references. Moving editable projects also requires preserving or updating their external file addresses.

Published Outputs can carry an optional author `displayName` for browsers such as Studio.
It is presentation text only: Output names, historical publication sources and file ownership do not change.

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
