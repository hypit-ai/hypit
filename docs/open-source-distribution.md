# Open-source distribution

Status: release boundary, readiness audit and update policy, 2026-08-12.

The repository is usable today as a checked-out developer workspace. It is not yet a published npm
distribution: every workspace package is private, exports TypeScript source directly and uses a
development version. These facts are packaging state, not hidden requirements of Core.

The implemented graph, compiler and Runtime are sufficient for a useful public source preview.
The remaining critical path is release engineering: legal permission, repository provenance,
installable artifacts, consumer tests, data migration and a repeatable update process. Adding more
video-domain components is not a prerequisite for opening the source.

## 0. Three different release claims

The project must not use “open source” as if it meant one indivisible milestone:

| Claim | Meaning | Current position |
|---|---|---|
| Public source preview | People may legally inspect, clone and contribute to the repository | close, after legal/history/asset gates |
| Installable alpha | A clean project can install a released CLI and packages without this checkout | release engineering is not implemented |
| Upgradeable ecosystem | Package, Runtime and database updates preserve stated compatibility and recovery laws | version policy and migrations are not implemented |

The public README and release notes must name which claim a release satisfies. A source preview must
not be presented as an npm-ready distribution, and an alpha must not imply a stable author ABI.

### Audited repository facts

As of this audit:

- all 88 workspace packages are private and use `0.0.0-dev`;
- package exports generally point at TypeScript source rather than compiled ESM and declarations;
- there is no published CLI binary backed by built JavaScript—the checkout launcher uses `tsx`;
- pull-request CI is absent; the only GitHub workflow publishes the documentation site;
- the repository root has no license, contribution, security, conduct, changelog or notice files;
- SQLite rejects an incompatible schema instead of migrating it;
- local WhisperX and OpenCV managed deployments still locate projects relative to the monorepo;
- type checking, the full test suite, release-hygiene tests and documentation build pass in the
  source workspace.

These are release blockers, not reasons to expand Core.

## 1. What can be distributed independently

The release unit is a package facet, not the whole Narratage system:

| Layer | Typical packages | Required restart after an update |
|---|---|---|
| Wire/Kernel | `@narratage/protocol`, `@narratage/core` | compiler and Runtime processes using that version |
| Author/compiler | Frontend, Surface, Elaborator, trusted loader | compiler process only |
| Deterministic compute | Producer or validator facet | worker/Runtime process that loaded it |
| Runtime service | Scheduler, Store, credential or transport adapter | Runtime process selecting it |
| Endpoint | KIE, Vertex, local media, WhisperX, HyperFrames | Runtime/worker selecting that Endpoint |
| Domain distribution | video contracts, Script, Track, Film | only compiler/workers that import those packages |

An active Build remains bound to its source closure, implementation closure and Runtime closure.
Updating an installed package does not silently change or resume that Build under a new identity.
New Builds can use the newly locked package without a Core release.

A logical Module is not required to become one physical npm package, and data-only author policy
does not need a logical Module at all. The seven reusable Seedance semantic Kits are ordinary
`TextTemplate` source resources shipped together by `@narratage/seedance-kits`; they feed the one
generic Text and Seedance graph vocabulary. A component that owns real lowering semantics, such as
Media Track, keeps its own Manifest/import identity. Internal private workspace
packages remain convenient development boundaries and do not settle the final public package
topology.

Another domain needs only `@narratage/protocol` and `@narratage/core` for the irreducible state machine. It
will usually also choose `@narratage/source`, an Elaborator, `@narratage/run`, a compiler Host, Driver and
Runtime adapters. It does not need the official Markup, SVS or Run Markup Frontends, text programs,
video contracts or
any video Endpoint.

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

`@narratage/compiler-node` exposes separate Author and Run compiler hosts for arbitrary registered
Frontends; each source selects its exact Frontend through a mandatory Header.
`@narratage/package-loader-node` only locks and loads physical package facets; it does not select a
syntax. Host-specific
executable facets carry an exact ABI and canonical identity, and stay inert until a matching Host
selects them.

`@narratage/compiler-markup-node` is the explicitly named Markup assembly. It installs only Markup Surface
Host facets and combines them with the syntax-neutral compiler. `@narratage/cli` is now the generic
command engine and has no video author-package aggregate or video Endpoint dependency.
`@narratage/video-cli` supplies the Markup compiler only. One explicit package lock selects every
Author/Run Frontend, Surface and deterministic component package; a separate Runtime package lock
selects Provider and Store adapter facets. Public publication of those already separated packages
remains deferred work.

Run Fragment packages use the ordinary Host Facet envelope with ABI
`svml.run-fragment-host@1`. The generic Loader locks that opaque identity; only the Run Host
interprets and registers its Fragment exports. New Run capabilities therefore do not add another
field or branch to the Loader.

`@narratage/artifact` owns the domain-neutral nominal `BlobArtifact` Graph type. Filesystem and S3
packages implement the separate Runtime `ArtifactStore` port. This avoids making a non-video domain
depend on `@narratage/media` merely to pass immutable bytes between Operations.

## 4. Package-manager and container policy

pnpm is the repository's monorepo tool because the workspace currently develops many tightly
versioned packages together. It is not intended to become a runtime requirement of published
packages. A public release must emit ordinary ESM JavaScript, declarations and package exports that
can be consumed without a pnpm workspace. The first release should claim only package managers and
operating systems exercised by clean consumer fixtures. npm and pnpm are the initial required
consumers; Yarn, Bun and Windows remain unclaimed until tested.

Containers are optional deployment bundles, not the extension model. Protocol/Core and ordinary
Node Hosts should run without Docker. A container is useful for environment-heavy Endpoints such as
WhisperX, Chrome/HyperFrames or FFmpeg, and a deployment may replace each with a local process,
Lambda or remote service implementing the same locked capability.

## 5. First public-release gates

### 5.1 Public source preview

Before making the repository public:

1. choose a license and add `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, a code of conduct and a
   third-party notice policy;
2. scan every commit, branch and tag for credentials, customer names, workstation paths and files
   that were deleted only from the working tree;
3. audit every documentation image, font, video and other redistributed asset for provenance and
   redistribution permission, replacing uncertain assets with cleared brand-neutral examples;
4. settle the public GitHub organization, documentation domain, npm scope ownership and security
   reporting address;
5. classify old branches/tags as public history, private archive or removable pre-release debris.

If the complete history cannot be made public safely, retain the original repository privately and
publish a clean audited repository or mirror. Deleting a file from the current tree is not a history
cleanup.

### 5.2 Installable alpha

The repository should not claim npm-ready distribution until it has:

1. a release manifest classifying public foundation packages, extension APIs, official video
   packages, optional Providers and repository-private packages;
2. settled physical package names and the version policy in section 6;
3. one release builder producing compiled ESM, `.d.ts`, source maps, explicit `exports`, minimal
   `files` and ordinary semver dependencies instead of `workspace:*`;
4. a real `narratage` package with an executable `bin`, launching built JavaScript rather than
   `tsx` or a repository-relative `cli.ts`;
5. a distribution strategy for the pinned WhisperX and OpenCV projects: package the managed
   service assets, publish a separate service artifact, or require an explicit external command;
6. package identity rules that distinguish semantic implementation identity from the exact physical
   bytes already bound by package locks—development digest labels must not impersonate published
   artifacts;
7. clean-directory consumer tests that install the exact packed tarballs and exercise `help`,
   package locking, provider-free `check`/`plan` and one free deterministic Build;
8. tarball inspection proving that tests, credentials, customer media, workspace paths and unrelated
   assets are absent;
9. CI for type checking, focused tests, documentation, repository hygiene, package construction and
   consumer fixtures on every supported platform;
10. trusted publishing with short-lived CI identity and provenance, followed by a registry-installed
    post-publication smoke test;
11. a documented trusted-extension level and an honest statement that arbitrary community
    Frontend, Producer and Validator code is not sandboxed.

The release manifest is publishing metadata, not a Runtime registry. It says which artifacts the
project maintains; it grants no package execution authority and adds no component union to Core.

### 5.3 Test policy

Release work does not justify restoring broad snapshot or implementation-detail tests. Add only
tests at boundaries a source-workspace suite cannot prove:

- packed-tarball installation outside the monorepo;
- supported Node/OS/package-manager combinations;
- database migrations from real earlier public schemas;
- service-asset discovery after installation;
- registry publication and CLI startup.

Paid KIE/Vertex and live AWS canaries stay explicit, protected and opt-in. They do not run on every
pull request.

## 6. Version and update policy

### 6.1 Logical versions and package versions are different

`<import from="@narratage/script@1"/>` names a logical Module contract. It remains `@1` while that
contract remains compatible. `@narratage/script@0.4.2` is a physical npm artifact and may change for
bug fixes, additive capabilities and packaging work without rewriting Author Source.

Logical `@1` therefore must not be synchronized with npm semver. Conversely, changing the meaning
of logical `@1` is not permitted merely because a physical package is still pre-1.0.

### 6.2 Independent package releases

Physical packages should use independent semver. Updating Caption, Seedance or one Provider must not
force a Core, Store and every unrelated Track release. Release tooling such as Changesets may derive
dependent version bumps, changelogs and a reviewable version pull request from the package graph.

The user-facing CLI distribution may publish a tested combination of package ranges and a starter
profile. That convenience package is not a central component registry: source imports, package
locks and the Runtime Profile remain the authorities.

### 6.3 User-visible update flow

A physical update is explicit:

1. the project package manager changes selected package versions and records them in its lockfile;
2. `narratage lock-packages` refreshes the Author/compute and Runtime package locks;
3. `narratage doctor`, `check` and `plan` expose environment, source and execution changes before a
   paid Build;
4. new Builds use the new Runtime Revision;
5. an unfinished Build remains bound to its original source, implementation and Runtime closures.

The system does not self-update packages, rewrite `.svml`, route to a new Provider or resume an old
Build under new code. A deployment either finishes/cancels unfinished work with the old installed
revision or uses a separate DispatchStore for the new revision. Completed Builds and their accepted
Artifacts remain archives.

An eventual CLI update helper may compare installed and locked revisions and print these actions. It
must not become a hidden package installer or Runtime authority.

### 6.4 Durable database migration

The first public alpha may declare all earlier private development schemas unsupported and establish
a new public schema baseline. From that release onward, every incompatible SQLite change requires:

- ordered `N -> N+1` migrations;
- a backup before mutation;
- transactional application and rollback;
- read-only `doctor` preflight explaining the required action;
- fixtures produced by actual previous public releases;
- a stated support window and recovery procedure.

Artifact bytes are stored separately, but that does not make disposable the Build, Operation,
Dispatch, Journal and Catalog facts that explain expensive work.

### 6.5 Rollback and bad releases

Rollback installs the prior exact physical package versions, restores the corresponding package
locks and runs the matching Runtime Revision. A bad public npm release is deprecated and followed by
a corrective patch; ordinary recovery must not depend on unpublishing package bytes.

## 7. Release automation and supply chain

The publication workflow should:

1. accept a reviewed version/changelog pull request;
2. build the release artifacts once;
3. run tests against those exact tarballs rather than rebuilding different bytes later;
4. create the Git tag and release notes;
5. publish through npm trusted publishing/OIDC with provenance and no long-lived npm token;
6. install from the public registry in a new project and run the post-publish smoke test;
7. move a release from `next` to `latest` only after the public artifact passes.

Maintain dependency-update automation, protected release environments, required branch checks and
two-factor protection for the npm organization. Generate per-package changes and one human-readable
distribution release note explaining which combination was tested.

## 8. Supported scope and explicit non-blockers

Untrusted extension isolation, a marketplace and hosted multi-tenant services may follow later.
They are not prerequisites for a useful source-checkout release or installable local alpha. The
following also remain optional:

- a hosted Scheduler or hosted Build service;
- remote WhisperX;
- public deployment bundles for every existing AWS resource;
- every possible Provider;
- complete migration of every historical engine video feature;
- package-manager and operating-system combinations the project does not claim to support.

The first installable alpha should instead prove one honest path: install the CLI in a clean project,
compile an explicit Author and Run Graph, execute a free deterministic Build, and—with separately
configured credentials and tools—run one documented video vertical slice.

## 9. Implementation order

1. Decide license, public identity, support matrix and public-history boundary.
2. Audit Git refs and redistributed assets.
3. Define the public package manifest and derive its transitive release closure.
4. Implement compiled package artifacts and the real CLI binary.
5. Remove repository-relative service and worker entrypoints from published execution.
6. Add packed-tarball consumer fixtures.
7. Establish independent semver, changelogs and release automation.
8. Establish the first public SQLite schema and migration harness.
9. Add CI, trusted publishing and post-registry smoke testing.
10. Publish an explicit `next` alpha; promote only after outside-the-repository installation succeeds.
