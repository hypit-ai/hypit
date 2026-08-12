# Validation boundaries

Validation protects an expensive, recoverable graph execution. It must not become another workflow
the video author operates, and it must not copy one fact through every package.

The governing rule is:

> One fact has one owner and is checked at the boundary where it first becomes trusted.

Downstream packages trust the typed Record admitted at that boundary. They may validate requirements
that only they own, but they do not repeat upstream validation or add defensive lineage fields to a
domain value. Dependencies remain explicit graph edges.

## Gates

| Gate | Sole responsibility | Must not do |
| --- | --- | --- |
| Source compilation | syntax, imports, declared ports, typed Author Graph | inspect Provider credentials or media bytes |
| Run compilation | Targets, Candidate bindings, finite selected Run Graph | invent a Candidate or cache decision |
| Core admission | command/event identity, derivation integrity, state transition legality | understand video, subtitles, KIE or filesystems |
| Runtime admission | selected Endpoint coverage, capacity and durable dispatch | change author meaning or validate unused Endpoints |
| Endpoint activation | parse one selected deployment config and declare capabilities, credential/environment references and prerequisites once | resolve those references, call a Provider, start a process or mutate state |
| Provider execution | translate one Need, bound requests/responses, report factual progress and cancellation | reinterpret the graph or accept an undeclared capability |
| Artifact boundary | compute identity on write; verify identity while bytes are read | download or rehash whole bytes for a presence query |
| Type owner | schema and intrinsic semantic invariants of its own value | copy provenance, graph edges or unrelated deployment facts into the value |
| Consumer | requirements unique to that consumption | re-run every producer/type-owner check “just in case” |

`doctor` is a read-only view across declarations, not an additional authority. It evaluates the same
pure Endpoint activation used by execution and may run explicitly declared bounded probes. A normal
Build does not require the author to run `doctor`; it checks only the selected Run Graph before a
side effect.

## Artifact operations

Content addressing does not require repeated whole-file passes:

1. `put` / `putStream` hash bytes as they are written.
2. The store publishes the completed object atomically under that digest.
3. `has` answers only whether that addressed object exists, using filesystem metadata or object-store
   metadata.
4. `get` / `open` hash bytes in the same pass in which the consumer reads them and reject a mismatched
   digest.

A corrupt object can therefore be observed as present, but it can never complete a verified read or
be silently accepted by a consumer. Presence is scheduling information; integrity belongs to byte
transfer.

## Developer-facing rule

Normal use is one command:

```bash
narratage build build.svrun --follow
```

Package locking occurs when selected package bytes change. `doctor`, `check`, `plan`, queue inspection
and cancellation remain explicit diagnostics or control tools, not mandatory ceremony before every
video. SQLite, Worker leases, operation receipts and artifact digests are internal implementation
details unless a developer deliberately inspects them.

## Non-negotiable checks

The following stay even though they are normally invisible: locked package identity, explicit
Candidate selection, Core state/derivation integrity, durable Worker leases and capacity, Provider
timeouts and bounded responses, honest cancellation, and Artifact identity at byte-transfer
boundaries. Removing them risks duplicate paid work, the wrong realization, corrupt output or an
unrecoverable long-running Build; duplicating them in multiple layers provides no additional truth.
