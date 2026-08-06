# `@svml/elaborator`

Parser-independent author linking and static Graph Fragment elaboration outside SVML Core.

The package is the optional compilation layer between authored declarations and the domain-free
Kernel. A frontend, API or visual editor first emits one sealed `svml.author-module@1` containing
component calls with symbolic Record/Component-output references. The Elaborator then works in two
phases:

1. lock every referenced Fragment and predeclare every component export;
2. resolve references, reject missing values, type mismatches and cycles, hygienically instantiate
   Fragments, then emit one ordinary `svml.graph@1` for Core.

Because all exports are collected before any input is resolved, declaration order has no meaning
and a component may reference a later component. The linker itself does not parse `.svml`, execute
package code or know any domain vocabulary. The non-video laboratory test demonstrates that the
same layer works without `@svml/text` or audiovisual contracts.

The official Text adapter now emits this exact Author Module format. Its separate non-video
integration fixture proves the complete `source → Surface → AuthorModule → Graph → BuildPlan` path;
Text still does not become a prerequisite for direct API or visual-editor callers.

The package also provides the domain-neutral recursive Source Closure reference implementation.
The Host supplies an entry SourceUnit, exact Frontend registry, immutable module closure and a
Source resolver. Source compilation discovers dependencies before decoding, rejects cycles and
duplicate aliases, decodes dependencies first, hygienically qualifies private Record/component
identities and binds only declared public exports into importer namespaces. Host filesystem paths
are excluded from Source Closure identity; source contents, Frontend digests and written import
edges remain covered. Every source asset actually requested during decode is also covered by its
author-written locator and exact content-addressed `BlobRef`; raw bytes remain a Host transfer
concern and never enter the parser-independent AuthorModule or Core BuildState.

The orchestration ABI is asynchronous even when a local Text/SVS implementation is synchronous.
This lets a browser, sandbox or remote repository provide SourceUnits without changing the
compilation contract. The Host resolver is the authority for path canonicalization, workspace
containment, symlink policy and I/O; Elaborator receives bytes and identities but never opens files
or grants filesystem access itself.

Asset resolution follows the same inversion of authority. The decode context exposes only an
asynchronous `resolveAsset({ from, mediaType })` capability. Elaborator validates the returned
identity, rejects conflicting media assignments for one written locator and folds the dependency
into Source Closure identity. It does not know whether a Host obtained the bytes from a filesystem,
browser upload, repository object or remote content store.

Frontend output passes a Host-owned Record admission hook before linking. The hook is permitted to
attach validation evidence but is forbidden to rewrite Record identity, Type, value, digest,
conformance or origin. `@svml/compiler-node` wires this to `@svml/validation` by default, so authored
values use the same Type-owner gate as Producer, Provider and provided Candidate values.

A `svml.fragment@1` value may reference only declared Fragment inputs and local Operations. It
contains no JavaScript callback, ambient file lookup, credential access or Runtime endpoint. Before
expansion the Elaborator verifies producer ports, types, cycles, reachable exports, Semantic Input
Envelopes and affinity sources.

Expansion assigns hygienic identities from `fragment digest + author instance id + local id`.
Multiple exports of one instance therefore share internal Operations, while two explicit instances
are never content-deduplicated. The result is ordinary `LogicalOutput`, `Candidate` and
`OperationNode` data that Core validates again.

`@svml/elaborator` is not a public `@svml/author` subsystem. It is a reusable graph-construction
library. A domain normally adds its own contract and component packages; Text remains only one
optional frontend capable of producing the same Author Module data.
