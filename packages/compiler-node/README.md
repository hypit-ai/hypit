# `@narratage/compiler-node`

Domain-neutral Node.js compiler host.

This package is outside Core. It connects a replaceable definition-time `Workspace` to the already
implemented compiler IR:

```text
Source Header + registered Frontends + registered manifests
  -> discovered Source/Module closure
  -> typed Source Closure
  -> Author Module + Graph
```

Every Author Source selects its own exact Frontend through the mandatory `@narratage/source` Header.
The compiler has no suffix table and no entry-Frontend default. A recursively imported source may
select another Frontend without the importer choosing on its behalf.

`ModulePackageRegistry` maps author import spellings to exact, already trusted manifests and closes
their digest-bound dependencies. It does not install npm packages or execute module code. An
embedding application must register the manifests and matching Frontend/Surface implementations it
has chosen to trust.

`NodeCompiler` requires the host-neutral `Workspace` contract. The reference CLI explicitly selects
`@narratage/workspace-fs-node`, where relative recursive Source imports are confined to one canonical
root, symlink escapes are rejected and each edge is locked to the first bytes read for that
compilation. A browser, Git, memory or remote Host can supply another Workspace without
changing Frontends, Surfaces, Source Closure identity or Core.

The Workspace session owns a separate Source Asset capability. A Frontend/Surface may request an
asset and assign its exact media type, but it never receives a path, filesystem handle or ambient
read authority. The Workspace returns a `BlobRef`, the compiler binds that reference into the
requesting SourceUnit, and the session exposes defensive generic `ArtifactAttachment`s on the Node
compilation result. `check` and `plan` perform no ArtifactStore write. `build` passes the attachments
to the selected Runtime for digest-checked staging.

SourceUnit recursion and Source Asset resolution are intentionally different capabilities: an
asset cannot import syntax, and a source import does not silently make arbitrary neighboring bytes
available to package code.

`NodeCompiler` runs a discovery pass first because Headers and imports must be known before source decoding,
while the exact Module Closure must be known before typed Records can be verified. It then invokes
the ordinary Elaborator Source Closure implementation.

`NodeRunCompiler` is the separate dual-graph assembly. It compiles one self-described Run Source,
opens its explicitly named Author Source in the same Workspace session, resolves the complete Run
Graph, extends the execution Program Closure with Modules referenced only by selected Run
Fragments, binds Author and Run graph identities into the final immutable graph, and only then asks
Core for a finite BuildPlan. The Author Graph remains unchanged. There is no Author-only planning
shortcut.

The package contains no Script, video, Provider, queue, credentials or rendering knowledge. A
non-video application can use it with only its own manifests, Frontends, Surfaces and chosen
Workspace implementation.

Package installation, third-party code loading and sandbox execution remain Host
features above this registry; treating an import string as permission to execute npm code would
violate the trust boundary.
