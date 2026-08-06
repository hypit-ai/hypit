# `@svml/compiler-node`

Domain-neutral Node.js compiler host for v2.

This package is outside Core. It connects a replaceable definition-time `Workspace` to the already
implemented compiler IR:

```text
file + registered Frontends + registered manifests
  -> discovered Source/Module closure
  -> typed Source Closure
  -> Author Module + Graph
  -> optional BuildPlan for named exports
```

`ModulePackageRegistry` maps author import spellings to exact, already trusted manifests and closes
their digest-bound dependencies. It does not install npm packages or execute module code. An
embedding application must register the manifests and matching Frontend/Surface implementations it
has chosen to trust.

`NodeCompiler` accepts the host-neutral `Workspace` contract. With no explicit Workspace it creates
the convenient `@svml/workspace-fs-node` default: relative recursive Source imports are confined to
one canonical root, symlink escapes are rejected and each edge is locked to the first bytes read for
that compilation. A browser, Git, memory or remote Host can inject another Workspace without
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

`NodeCompiler` runs a discovery pass first because Frontends must be known before source decoding,
while the exact Module Closure must be known before typed Records can be verified. It then invokes
the ordinary Elaborator Source Closure implementation. `planFile()` resolves author-facing export
names to Logical Outputs and asks Core to derive the finite reverse-demand plan.

The package contains no Script, video, Provider, queue, credentials or rendering knowledge. A
non-video application can use it with only its own manifests, Frontends, Surfaces and chosen
Workspace implementation.

Package installation, lockfile-based third-party code loading and sandbox execution remain Host
features above this registry; treating an import string as permission to execute npm code would
violate the trust boundary.
