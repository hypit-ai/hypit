# `@hypit/compiler`

Domain-neutral compilation orchestration.

This package is outside Core. It connects a replaceable definition-time `Workspace` to the already
implemented compiler IR:

```text
ResolvedSource + registered Frontends + registered manifests
  -> discovered Source/Module closure
  -> typed Source Closure
  -> AuthorGraph + public Source exports
```

Every Author Source reaches the compiler as a `ResolvedSource` with an exact Frontend. The default
filesystem Workspace can obtain that binding through `@hypit/source/text`; another Workspace or
package Source export can provide it directly. The compiler has no suffix table, body bootstrap or
entry-Frontend default. A recursively imported Source may select another Frontend through its own
resolution authority.

`ModulePackageRegistry` maps author import spellings to exact, already trusted manifests and closes
their declared Resource dependencies. It does not install npm packages or execute module code. An
embedding application must register the manifests and matching Frontend/Surface implementations it
has chosen to trust.

`Compiler` requires the host-neutral `Workspace` contract. The reference CLI explicitly selects
`@hypit/workspace/node`, where every recursive Source import is confined to the canonical root
that owns the importing SourceUnit, symlink escapes are rejected and each edge is locked to the
first bytes read for that compilation. The Host may explicitly mount another Source root; the
Compiler sees only the resulting Workspace units and does not know whether that root came from an
installed data package, Git, memory or another source. Another Host can supply a different
Workspace without changing Frontends, Surfaces, Source Closure identity or Core.

The Workspace session owns a separate Source Asset capability. A Frontend/Surface may request an
asset and assign its exact media type, but it never receives a path, filesystem handle or ambient
read authority. The Workspace returns a `BlobRef`, the compiler binds that reference into the
requesting SourceUnit, and the session exposes defensive generic `BlobAttachment`s whose `blob`
field names that exact reference on the Node compilation result. `check` and `plan` perform no
ResourceStore write. `build` passes the attachments
to the selected Runtime for size-checked staging.

SourceUnit recursion and Source Asset resolution are intentionally different capabilities: an
asset cannot import syntax, and a source import does not silently make arbitrary neighboring bytes
available to package code.

`Compiler` runs a discovery pass first because imports must be known before source decoding,
while the exact Module Closure must be known before typed Records can be verified. It then invokes
the Source Closure compiler and parser-independent Author linker.

`RunCompiler` is the separate dual-graph assembly. It compiles one resolved Run Source,
opens its explicitly named Author Source in the same Workspace session, resolves the complete Run
Graph, extends the execution Program Closure with Modules referenced only by selected Run
Fragments, binds Author and Run graph identities into the final immutable graph, and only then asks
Core for a finite BuildPlan. The Author Graph remains unchanged. There is no Author-only planning
shortcut.

`prepareCompilation` turns that completed structural selection into a `PreparedBuild`: it derives
one immutable `PublicationPlan`, seals the `BuildDefinition`, and exposes its materialized read view.
The publication binds each public Author name to its selected Logical Output, target membership, display name and either a
current Record source or an exact historical Result address. CLI catalogs, Runtime submission and
Result writing project this plan; they do not repeat Candidate selection or reconstruct forwarding.

The package contains no Script, video, Provider, queue, credentials or rendering knowledge. A
non-video application can use it with only its own manifests, Frontends, Surfaces and chosen
Workspace implementation.

Package installation, third-party code loading and sandbox execution remain Host
features above this registry; treating an import string as permission to execute npm code would
violate the trust boundary.
