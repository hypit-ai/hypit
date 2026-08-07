# Node package loading and facet activation

Status: implemented for trusted installed author and deterministic compute facets. Provider and
Runtime-service activation remain governed by Runtime Profile/Closure.

## 1. Purpose

Installing or updating a component must not require a Core, CLI or local Runtime source release.
The Node package loader turns an explicit developer trust decision into one reproducible
implementation closure:

```text
installed package bytes
  -> explicit lock-packages command
  -> physical declared-dependency-closure digests
  -> Module / Frontend / Host Facet / Producer / Type Validator identities
  -> verified NodePackageContribution
  -> Host grants only the selected author or compute registries
```

The official video CLI starts with no author-package aggregate. Each selected package contributes
its own Manifest, Frontend, Surface, Producer and Validator facets, and the local Runtime consumes
the same package lock without a hard-coded component list.

## 2. Package contract

An installed physical package declares one package-relative activation entry:

```json
{
  "name": "@example/cards",
  "version": "1.0.0",
  "svml": {
    "activation": "./dist/svml-package.js"
  }
}
```

The entry exports one `svml.node-package@1` `NodePackageContribution` containing any number of:

- immutable Module Manifests and author import specifiers;
- Author Frontends;
- ABI-identified Host facets, such as official Text Surface handlers;
- host-neutral `ComponentPackage` values with enumerable Producer and Type Validator facets.

Every executable facet carries its exact nominal identity and declared implementation digest. The
word *Contribution* is deliberate: the returned object says what the package offers; it does not
grant authority. A specific compiler or Runtime Host later installs only the facet ABIs it trusts.
Producer and validator facets are checked against the corresponding static Manifest declaration
before a Host registry receives their handlers. One physical package may aggregate multiple
logical modules; physical package identity and logical Module identity remain different facts.

## 3. One implementation lock

Create the lock only after installing and reviewing the selected packages:

```bash
narratage lock-packages ./svml.packages.lock \
  --package @example/cards \
  --root .
```

Use it for compilation:

```bash
narratage check ./main.svml --package-lock ./svml.packages.lock --root .
```

Use the same lock in a local Runtime configuration:

```ts
export default await createProjectLocalRuntime({
  root: import.meta.dirname,
  packageLock: "./svml.packages.lock",
});
```

Lock creation is the trust action. Normal loading:

1. parses and verifies the lock digest;
2. resolves the complete installed declared-dependency closure;
3. hashes every package file except nested `node_modules` and `.git` directories;
4. rejects any artifact-set difference before importing activation code;
5. imports each activation entry;
6. compares all declared facet identities with the lock;
7. checks Producer and Validator facets against their Module Manifests;
8. grants only the registries requested by the Host.

Changing any selected package or dependency byte requires a new lock. A Source import never updates
the lock and cannot download or activate a physical package.

## 4. Build and resume identity

For an executable plan, the package-lock digest enters `BuildRequest.implementationClosure`.
Consequently the Core Build identity binds both author Targets/Candidates and the exact trusted
implementation closure. A local Host loaded from a package lock refuses a BuildRequest that omits
that digest or names another lock.

This closes the dangerous restart case where a persisted Build could otherwise finish its later
deterministic steps with different package bytes that reused the same human-authored implementation
label. Individual Derivations still bind the Manifest-declared Producer implementation digest; the
BuildRequest binds the physical package closure that gives that digest executable meaning.

## 5. Authority boundary

The package lock is an implementation lock, not a Runtime Profile. It contains no:

- Provider binding, account or credential;
- Scheduler or concurrency policy;
- Build, Operation, Artifact or Credential store selection;
- Candidate selection or Build Target;
- network, process or filesystem-write grant.

The syntax-neutral Loader does not install any Host facet. `@narratage/compiler-text-node` explicitly
selects the official Text Surface ABI; another compiler may select another ABI. The local compute
Host receives only Producer and Validator registries and does not depend on Text. Source `<import>`
merely selects an already activated logical author module for a Source Closure; it cannot cause
Producer execution and cannot activate Provider or Runtime-service facets.

The current loader still executes reviewed JavaScript in process after integrity verification. Integrity
is not confinement: community code requires an isolated Worker, resource limits and a real
permission boundary before it can be treated as untrusted.

## 6. Executable proofs

Tests create installed packages unknown to the repository and prove all of the following:

- a namespaced Text Surface compiles through the explicit Text compiler without a Core or CLI
  registration change;
- unrelated Host-facet ABIs remain inert;
- its authored value passes its locked Type-owner Validator and carries a validation receipt;
- its deterministic Producer is discovered as enumerable locked data;
- independently activated official packages close over `@narratage/speech-take`,
  `@narratage/speech-align` and `@narratage/caption`, exposing Product projections, the timing locator,
  Caption lowering and Caption-owned validators without a CLI registration list;
- `createProjectLocalRuntime({ packageLock })` executes that Producer without a deployment-source
  component list;
- an unlocked or differently locked BuildRequest is rejected by that Host;
- mutating any selected package or dependency byte is rejected before activation reuse.

The intended update blast radius is therefore:

```text
new or updated component package
  -> install package
  -> review and regenerate package lock
  -> restart only the Compiler/Runtime process that loads that facet

no Core change
no CLI or @narratage/local source change
no database migration
no Provider reconfiguration
```

## 7. Deliberately remaining work

- isolate untrusted Frontend, Surface, Validator and Producer code;
- replace development placeholder implementation labels with release-built facet identities while
  preserving the package-closure binding described above;
- add automatic package installation/discovery only after the explicit trust flow is stable;
- keep Provider and privileged Runtime-service activation in Runtime Profile/Closure rather than
  granting those authorities to this package descriptor.
