# `@hypit/author`

Parser-independent author linking and static Graph Fragment elaboration outside SVML Core.

The package is the optional compilation layer between authored declarations and the domain-free
Kernel. A Frontend, API or visual editor emits decoded Records, component calls and public exports.
Every component directly carries its Graph Fragment and uses symbolic Record/Component-output
references. The Author linker then works in two
phases:

1. lock every referenced Fragment and predeclare every component export;
2. resolve references, reject missing values, type mismatches and cycles, hygienically instantiate
   Fragments, then emit one ordinary `hypit.graph@1` for Core.

Because all exports are collected before any input is resolved, declaration order has no meaning
and a component may reference a later component. The linker itself does not parse `.svml`, execute
package code or know any domain vocabulary. The non-video laboratory test demonstrates that the
same layer works without `@hypit/markup` or audiovisual contracts.

Before that graph-linking boundary, the package also owns the syntax-neutral Author Declaration ABI.
An `AuthorDeclaration` contains only a package Module, declaration name, literal/reference fields,
package-owned children and Source provenance. Its package compiler first declares every binding and
then lowers the declaration to Records and Components. `compileAuthorDeclarations()` collects all
bindings before resolving any reference and compiles declarations in dependency order,
so a declaration can read a later authored Record without making source order semantic. Component
outputs expose only their reference and Type; the compiler never fabricates a Record value for work
that has not executed.

The compiler's `shape` is the single structural authority for fields, nested declarations, text,
cardinality, literal choices and accepted reference Types. Author validates that shape before package
lowering. Frontends and Studio may project it for their own presentation, but do not maintain another
list of accepted fields. Syntax-specific examples and printing remain with the Frontend.

Structured declarations may also carry an ordered `body` made only of decoded text parts and indexes
into their package-owned children. This preserves mixed content such as text interrupted by inline
declarations without admitting a Markup, DOM or editor node into Author. `declarationBody()` resolves
that storage form for package compilers. Author checks that every direct child occurs exactly once and
that every text range remains inside its declaration.

A shape may name declaration-local child groups and refer to them recursively. This expresses grammars
such as a Film scope containing Tracks and nested scopes without imposing a maximum depth or moving
domain node names into Author. Groups are local to one package compiler; Author validates their shape
and then follows only the finite declaration tree supplied by the caller.

`AuthorDeclarationRegistry` and the `hypit.author-declaration@1` Facet carry those package compilers.
They contain no tag, XML node, editor presentation, Runtime or filesystem implementation. A direct API
and any textual Frontend can therefore construct the same declaration and use the same package-owned
validation and graph lowering.

The separate `AuthorDocument` contract is the revision-scoped editing projection of one Source. It
contains neutral imports and declaration/container locators plus an opaque representation owned by the selected
Frontend. Document operations describe insertion, deletion, movement, distinct field add/replace/remove,
structured-text replacement and import changes without exposing the Frontend's syntax tree. They do not enter `DecodedAuthorSource` or
AuthorGraph and are not an editor database. A Frontend may expose this capability through
`AuthorFrontend.document`; non-editable Frontends need not implement it.

The official Markup adapter emits this same parser-independent structure. Its separate non-video
integration fixture proves the complete `Source → declaration → AuthorGraph → BuildPlan` path;
Markup still does not become a prerequisite for direct API or visual-editor callers.

The package owns the parser-independent Frontend, decoded author structure, Source Closure and provenance
contracts consumed by compilation. `@hypit/compiler` owns recursive discovery and closure
orchestration: it receives a `ResolvedSource`, exact Frontend registry, immutable module closure and
Workspace resolver, rejects cycles and duplicate aliases, and decodes dependencies before their
importers. The Author linker then qualifies private Record/component identities and binds only
declared public exports into importer namespaces. Workspace paths remain outside Source Closure
identity. Source bytes and resolved asset bytes remain owned by the Workspace; the decoded structure
and Kernel BuildView carry only the values and Blob identities required by the authored graph.

The same hygienic pass emits an ephemeral `hypit.author-provenance@1` sidecar. A Frontend may retain
the structural ranges of author elements and inputs; the Author linker qualifies their Record, component,
output and endpoint identities together with the graph. This is a compiler result, not a Source
file, lock, content inventory or editor database. It carries no domain or Studio presentation and
lets any diagnostic/editor join a graph value back to the exact author endpoint without matching a
local name after compilation.

Declaration compilation groups outputs by the exact source range returned by their package compiler.
The outer declaration, structured children and semantic objects discovered inside an opaque body may
therefore remain independently addressable without teaching Author their domain syntax. This relation
does not make semantic values printable: reversible bytes and local edits belong to `AuthorDocument`,
while provenance only connects rebuildable semantic outputs to their owning source locations.

The orchestration ABI is asynchronous even when a local Text/SVS implementation is synchronous.
This lets a browser, sandbox or remote repository provide SourceUnits without changing the
compilation contract. The Host resolver is the authority for path canonicalization, workspace
containment, symlink policy and I/O; the Author linker receives bytes and identities but never opens files
or grants filesystem access itself.

Asset resolution follows the same inversion of authority. The decode context exposes only an
asynchronous `resolveAsset({ from, mediaType })` capability. The Author linker validates the returned
identity, rejects conflicting media assignments for one written locator and folds the dependency
into Source Closure identity. It does not know whether a Host obtained the bytes from a filesystem,
browser upload, repository object or remote content store.

`readAsset({ from, mediaType })` is the corresponding non-publication operation for package compilers
that must interpret an exact auxiliary input before constructing a value. It returns bytes only;
locator resolution, containment and I/O remain Host responsibilities. It neither exposes paths nor
permits enumeration, and it does not turn the read input into a build attachment.

Frontend output passes a Host-owned Record validation hook before linking. The hook is permitted to
reject a Record but is forbidden to rewrite Record identity, Type or value.
The compiler Host explicitly supplies its `@hypit/refinement` registry, so authored
values use the same Type-owner gate as Producer and Endpoint results. Invocation can only select an
already validated authored Record; it introduces no additional value source.

A `hypit.fragment@1` value may reference only declared Fragment inputs and local Operations. It
contains no JavaScript callback, ambient file lookup, credential access or Runtime endpoint. Before
expansion the Author linker verifies producer ports, types, cycles, reachable exports and Semantic
Input Envelopes.

Expansion assigns hygienic identities from the author instance id and Fragment-local id.
Multiple exports of one instance therefore share internal Operations, while two explicit instances
remain two nodes even when their content is identical. Author exports become Logical Outputs whose
primary roots directly name a Record or Operation result. The result is ordinary graph data that Core validates again before freezing a BuildPlan.

`@hypit/author` is a reusable graph-construction owner, not a universal Author SDK facade. A domain
normally adds its own contract and component packages; Text remains only one
optional Frontend capable of producing the same decoded author data.
