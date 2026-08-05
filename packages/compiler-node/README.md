# `@svml/compiler-node`

Domain-neutral Node.js compiler host for v2.

This package is outside Core. It owns the environmental work required to turn a real file into the
already implemented compiler IR:

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

`NodeSourceHost` is the filesystem authority. It accepts only relative recursive Source imports,
canonicalizes real paths, confines reads to one declared root, rejects symlink escapes and locks
each import edge to the first bytes read for the whole compilation. Source paths are diagnostics and
cache keys; Source Closure semantic identity still depends on content rather than machine location.

`NodeCompiler` runs a discovery pass first because Frontends must be known before source decoding,
while the exact Module Closure must be known before typed Records can be verified. It then invokes
the ordinary Elaborator Source Closure implementation. `planFile()` resolves author-facing export
names to Logical Outputs and asks Core to derive the finite reverse-demand plan.

The package contains no Script, video, Provider, queue, credentials or rendering knowledge. A
non-video application can use it with only its own manifests, Frontends and Surfaces.

Package installation, lockfile-based third-party code loading and sandbox execution remain Host
features above this registry; treating an import string as permission to execute npm code would
violate the trust boundary.
