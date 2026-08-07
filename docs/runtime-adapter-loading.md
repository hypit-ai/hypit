# Runtime Adapter loading

Status: implemented for the trusted local Node Host. Public package publication and untrusted-code
isolation are intentionally deferred.

## 1. The boundary

Author and Run sources describe graphs. They cannot grant deployment authority. A Provider or Store
may read credentials, access files, spawn processes or call a network, so it must be selected by the
Runtime Profile through an independently reviewed physical-package lock.

```text
main.svml + build.svrun
        │
        └── author/compute packageLock ──> frozen graph and deterministic implementations

svml.runtime.json
        │
        └── runtimePackageLock ──────────> Endpoint/Store adapter inventory
                                              │
                                              └── resolved Runtime Closure
```

Both locks use `svml.node-package-lock@1`; they differ by the Host ABI that consumes them. Loading a
package never activates all of its facets.

## 2. Package contract

A runtime-capable physical package declares `svml.activation` and contributes one or more generic
Host facets with ABI `svml.runtime-adapter-host@1`. Each facet has only:

- an exact `use` name;
- kind `endpoint` or `service`;
- a factory from project root, instance, lane and closed canonical configuration;
- an optional read-only doctor function.

The Provider package owns translation from its configuration into an `EndpointPackage`. A Store
package owns translation into a `RuntimeServicePackage`. The generic CLI and local Host know neither
KIE nor FFmpeg nor S3.

## 3. Identity and activation order

The Node Host performs these gates before execution:

1. parse the Runtime Profile as closed data;
2. resolve `runtimePackageLock` relative to the declared project root;
3. hash every file in every selected package dependency closure;
4. reject any lock/artifact/facet mismatch before importing activation code;
5. install only valid Runtime Adapter Host facets;
6. resolve every Profile `use` against that finite inventory;
7. construct Endpoint and service packages;
8. replace each declared Runtime facet digest with a digest over the physical package Artifact,
   that package's transitive dependency closure, adapter identity, facet name and declared digest;
9. resolve permissions and the Runtime Closure;
10. allow the Driver to execute Core-derived Commands.

The registration proxy applies the same rebound digest to the executable handler registration.
Changing implementation or dependency bytes therefore changes Runtime identity and an old lock
fails before a side effect. Source `<import>` participates in none of these steps.
Adding an unrelated, unselected adapter package does not change an existing Endpoint's identity.

## 4. Paths and diagnostics

Runtime `root` is resolved relative to the Profile file. State, catalog, Artifact, implementation
lock, Runtime lock and configured executable paths are then resolved relative to that root. Bare
executable names remain PATH lookups. This makes a project relocatable and removes workstation
absolute paths from checked-in configuration.

```bash
svml doctor ./svml.runtime.json
```

Doctor is read-only. It verifies package bytes and adapter configuration, then asks each selected
adapter to report missing credentials or executables. It does not submit Provider jobs or execute a
Build.

## 5. Artifact lifecycle

The minimal `ArtifactStore` remains whole-object and content-addressed. Stores may additionally
implement independent streaming and maintenance capabilities:

```text
StreamingArtifactStore  putStream / open
ManagedArtifactStore    list / delete
EnumerableBuildStore    list verified Build snapshots
```

The local filesystem implementation supports all three relevant capabilities. Explicit GC scans
every retained BuildState and Operation for BlobRefs; all other stored digests are unreachable.

```bash
svml gc ./svml.runtime.json          # report only
svml gc ./svml.runtime.json --apply  # delete unreachable bytes
```

GC does not release Builds, choose Candidates, infer reuse or implement a cache. A deployment with
a Store lacking the maintenance capability fails explicitly instead of pretending cleanup occurred.

## 6. Deferred work

- compiled/public npm package distribution and consumer matrices;
- sandboxing arbitrary untrusted Runtime Adapter activation code;
- S3 multipart/ranged streaming and provider-specific object lifecycle;
- Build release/retention-window policy;
- hosted multi-process leases and authorization.

None requires a new Core graph primitive or a Provider registry in the video CLI.
