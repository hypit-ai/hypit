# Build archive, retention and egress

Status: current domain-neutral storage law, 2026-08-07.

This document separates four concerns that must never be collapsed into one option:

| Concern | Authority | Meaning |
|---|---|---|
| Demand | Target list in Run intent | which finite reverse-reachable subgraph executes |
| Realization | Candidate and Satisfaction in Run intent | which explicit implementation supplies each demanded Logical Output |
| Archive | Runtime Stores | durable facts and bytes produced by that execution |
| Egress | Host command or explicit side-effect Operation | where a user copies or publishes an already archived result |

A Target is not an export directive. A destination path is not a retention root. Omitting a local
path never makes a completed Render, WhisperX result or other accepted output disappear.

## 1. The persistence boundary

The generic law is:

> Every value that crosses a component boundary as an accepted output is a durable Build Record.

This includes target results and reverse-reachable intermediate results. Core and Runtime do not
guess whether an intermediate is interesting. A package makes that decision structurally:

- a declared Producer output or Need result becomes a Record and is archived;
- bytes referenced by an accepted value are stored in ArtifactStore;
- external submission identity, checkpoints and completion live in OperationStore;
- local variables, process memory and scratch files inside one invocation are ephemeral.

If a result must be inspected, reused, audited or consumed by another component, the owning package
must expose it across a typed port. Turning an internal value into a port requires no Core change.

For example, the demanded speech-alignment path archives its audio facts, WhisperX Evidence,
normalized Evidence, SemanticMap and every Derivation between them. A temporary WAV staged for a
local process is not a fact and may be deleted after its result bytes are committed.

## 2. Three authoritative stores and one Host catalog

```text
BuildStore                         OperationStore
verified BuildState                recoverable external execution
├─ graph and request               ├─ exact command and endpoint
├─ finite plan                     ├─ submission identity
├─ every accepted Record           ├─ pending checkpoint / wakeAt
├─ Receipts and Derivations         └─ completion or failure
└─ accepted Event identities
                  │
                  └──── BlobRef ────> ArtifactStore
                                      content-addressed bytes
```

BuildStore is the authoritative archive of graph facts. OperationStore prevents a paid or remote
operation from being resubmitted after restart. ArtifactStore owns large bytes independently of
filesystem or S3 placement. BuildState contains BlobRefs, not private Store paths.

An optional `BuildCatalog` indexes human-facing Build presentation:

```text
Build id -> Core Build digest + source/run paths + source output aliases
```

It is deliberately not a Core Record, execution Store port or Runtime Closure facet. Catalog data
cannot satisfy an output, prove provenance, select a Candidate or affect scheduling. The Host must
resolve every alias back through the verified BuildState before returning a Record. This permits a
local CLI, an embedding server or a future UI to keep different indexes over the same execution
archive without changing Build identity.

The reference local distribution uses SQLite for BuildStore and OperationStore and a filesystem
content-addressed store for ArtifactStore. Other deployments may use Postgres and S3 without
changing source, Run intent or Core.

Content addressing deduplicates identical bytes only. It does not skip execution, select history or
act as an implicit Candidate cache. Reuse remains an explicit Run Graph choice.

## 3. Commit and recovery law

An Endpoint or Producer must place result bytes into ArtifactStore before it emits the Event that
refers to them. Core verifies and accepts that Event, then the Scheduler commits the resulting
BuildState by BuildStore compare-and-swap before advancing the graph.

```text
execute
  -> ArtifactStore.put(bytes)
  -> Event containing BlobRef
  -> Core transition
  -> BuildStore CAS
  -> next scheduling decision
```

A crash between ArtifactStore `put` and BuildStore CAS can leave an unreferenced CAS object; it
must never leave a committed Record pointing at bytes that were never stored. Runtime maintenance
can now enumerate every retained BuildState and Operation, compute Artifact reachability, and
remove such orphans explicitly. `gc` dry-runs by default; retention windows and the decision to
release a Build remain deployment policy rather than Core semantics.

Durable BuildState never trusts serialized outstanding Commands. On recovery, Core regenerates
Commands from the verified facts. OperationStore reconciliation then resumes an existing external
attempt instead of submitting it again.

## 4. Egress is a read, not a build semantic

Building without any destination path still archives the complete demanded execution:

```bash
narratage build production.svrun --runtime svml.runtime.json --follow
```

The command returns a Build identity. A separate Host read can inspect or materialize any accepted
Record:

```bash
narratage inspect <build-id> --runtime svml.runtime.json
narratage builds --runtime svml.runtime.json
narratage get <build-id> --name final.video --runtime svml.runtime.json
narratage get <build-id> --record <record-id> --runtime svml.runtime.json
narratage get <build-id> --record <record-id> --runtime svml.runtime.json --to ./final.mp4
narratage get <build-id> --artifact <digest> --runtime svml.runtime.json --to ./whisperx-raw.json
```

`get --to` copies or downloads already archived bytes. For an inline structured Record it writes a
JSON representation. It does not run the graph, create a Candidate, change Build identity or make
the destination path canonical. `--artifact` can select a nested BlobRef, but only when that digest
is referenced by a Record in the selected Build. It may read a Record already committed by a paused
Build.

The CLI selects Records by a source output alias, stable Record identity, demanded Logical Output or
the sole target when unambiguous. `builds` lists the Host Catalog, while `inspect` reports which
aliases currently resolve to accepted Records. An alias never bypasses Build verification and is
never added to `svml.build@1`.

A real external publication is different from a convenience copy. Uploading to a customer bucket,
publishing to a CMS or sending a delivery should be an explicit side-effect Operation with its own
Need, retry behavior and Receipt:

```text
FinalMedia -> PublishToCustomer -> PublicationReceipt
```

Core still knows no path, bucket or video type.

## 5. Retention and garbage collection

Initial developer policy is conservative: a Build remains retained until the Host explicitly
releases it, and every Record and Artifact reachable from that Build remains retained with it.

```text
retained BuildState / active Operation
                 │
                 ▼
        all referenced BlobRefs
                 │
                 ▼
          live CAS objects
```

When a new Build uses an earlier Record as a zero-input Candidate, the new accepted Provided Record
references the same content-addressed bytes. Releasing the old Build therefore cannot collect those
bytes while the new Build remains a root.

Retention, grace periods and garbage collection belong to Runtime Store adapters and deployment
policy. They are not Core transitions and are never inferred from whether a user copied a file to a
human-readable path. The reference local Runtime now exposes explicit reachability maintenance:

```bash
narratage gc ./svml.runtime.json          # dry-run
narratage gc ./svml.runtime.json --apply  # delete reported unreachable objects
```

Every retained BuildState and Operation is a root. The command therefore collects only orphan
objects; Build release/retention windows remain deployment policy and are not silently inferred.

## 6. Non-goals

- no automatic result cache or content-based Candidate selection;
- no special `final` node or privileged Film target;
- no implicit export of only target Records;
- no human filesystem path in author semantic identity;
- no Host catalog entry treated as execution truth;
- no Core registry of media formats or package-owned intermediate types;
- no deletion merely because a Build command omitted a destination path.
