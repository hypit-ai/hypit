# Open-source distribution

Status: release boundary and packaging plan, 2026-08-07.

The repository is usable today as a checked-out developer workspace. It is not yet a published npm
distribution: every v2 workspace package is private, exports TypeScript source directly and uses a
development version. The root `@svml/compiler` package still builds the retained v1 regression CLI.
These facts are packaging state, not hidden requirements of Core.

## 1. What can be distributed independently

The release unit is a package facet, not the whole SVML system:

| Layer | Typical packages | Required restart after an update |
|---|---|---|
| Wire/Kernel | `@svml/protocol`, `@svml/core` | compiler and Runtime processes using that version |
| Author/compiler | Frontend, Surface, Elaborator, trusted loader | compiler process only |
| Deterministic compute | Producer or validator facet | worker/Runtime process that loaded it |
| Runtime service | Scheduler, Store, credential or transport adapter | Runtime process selecting it |
| Endpoint | KIE, Vertex, local media, WhisperX, HyperFrames | Runtime/worker selecting that Endpoint |
| Domain distribution | video contracts, Script, Track, Film | only compiler/workers that import those packages |

An active Build remains bound to its source closure, implementation closure and Runtime closure.
Updating an installed package does not silently change or resume that Build under a new identity.
New Builds can use the newly locked package without a Core release.

Another domain needs only `@svml/protocol` and `@svml/core` for the irreducible state machine. It
will usually also choose an Elaborator, compiler Host, Driver and Runtime adapters. It does not need
the official Text Frontend, `.svrun`, video contracts or any video Endpoint.

## 2. Installation is not authority

Installing a package only makes its bytes available. Authority remains separately selected:

- source imports may activate declared author vocabulary;
- trusted compiler configuration activates Frontend, Surface and deterministic compute facets;
- Runtime Profile activates Endpoint, Store, Scheduler, transport and credential facets;
- permissions and credential references are granted to exact locked Endpoint instances.

No `<import>` installs an npm package, opens the network, reads a credential or starts a queue. A
new author component therefore does not require a monolithic application release, while a new
privileged implementation still requires the relevant Host to trust, lock and restart with it.

## 3. Reference Host assemblies

`@svml/compiler-node` accepts an arbitrary registered entry Frontend. `@svml/package-loader-node`
only locks and loads physical package facets; it does not select an author syntax. Host-specific
executable facets carry an exact ABI and canonical identity, and stay inert until a matching Host
selects them.

`@svml/compiler-text-node` is the explicitly named Text assembly. It installs only Text Surface
Host facets and combines them with the syntax-neutral compiler. `@svml/cli` is now the generic
command engine and has no video Prelude or video Endpoint dependency. `@svml/video-cli` is the
explicit application Distribution that supplies the Text compiler, built-in video package
contributions and video Runtime-config adapters.

`@svml/artifact` owns the domain-neutral nominal `BlobArtifact` Graph type. Filesystem and S3
packages implement the separate Runtime `ArtifactStore` port. This avoids making a non-video domain
depend on `@svml/media` merely to pass immutable bytes between Operations.

## 4. Package-manager and container policy

pnpm is the repository's monorepo tool because the workspace currently develops many tightly
versioned packages together. It is not intended to become a runtime requirement of published
packages. A public release must emit ordinary ESM JavaScript, declarations and package exports that
can be installed by npm, pnpm, Yarn or Bun; that compatibility has not yet been verified.

Containers are optional deployment bundles, not the extension model. Protocol/Core and ordinary
Node Hosts should run without Docker. A container is useful for environment-heavy Endpoints such as
WhisperX, Chrome/HyperFrames or FFmpeg, and a deployment may replace each with a local process,
Lambda or remote service implementing the same locked capability.

## 5. First public-release gates

The repository should not claim npm-ready open-source distribution until it has:

1. a chosen license plus `LICENSE`, contribution, security and conduct policies;
2. settled public physical package names and semantic-version policy;
3. non-private release manifests with compiled ESM, `.d.ts`, explicit `exports` and `files`;
4. release CI covering npm/pnpm/Yarn/Bun consumer fixtures and package provenance;
5. generated implementation identities derived from release artifacts rather than development
   labels;
6. a documented trusted-extension level and an honest statement that arbitrary community code is
   not sandboxed;
7. published binaries that map the generic command engine and explicit video Distribution without
   exposing the retained v1 root as the new public compiler.

Untrusted extension isolation, a marketplace and hosted multi-tenant services may follow later.
They are not prerequisites for a useful trusted-developer release.
