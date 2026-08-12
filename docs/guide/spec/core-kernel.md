---
title: Narratage Core Kernel
description: current executable contract. Persisted Graph, BuildRequest, Plan and BuildState wire.
---

# Narratage Core Kernel

Status: current executable contract. Persisted Graph, BuildRequest, Plan and BuildState wire
formats are `@1`.

Core is a domain-free graph-demand compiler and verified Build state machine. It does not parse
source, load packages, execute implementations, choose an Endpoint, access credentials, persist
artifacts or know video vocabulary.

## Inputs

Core accepts immutable, already linked data:

- a resolved module closure and typed authored Records;
- a complete `svml.graph@1` containing Logical Outputs, independent Candidates and atomic
  Operations from the Author and Run Graphs;
- a `svml.build-request@1` containing Targets.

Graph construction, source parsing, package resolution, Fragment expansion and Run Graph authoring
happen outside Core. Core verifies the resulting data before deriving a plan.

## Graph values

1. A `LogicalOutput` is a stable author-visible promise: identity, nominal Type and Primary
   Candidate.
2. A `Candidate` is an independent typed supply. Its root is one immutable Provided Value or one
   atomic Operation result. It does not belong to an output.
3. The Run compiler applies each explicit `Satisfaction` by making its Candidate that output's
   Primary Candidate in the immutable realized graph. Core receives no second selection source.
4. A `Target` names an output required by this Build.
5. An `Operation` has stable instance identity, declared typed inputs and exactly one atomic result.
   Multi-result components use one Product followed by deterministic Projection Operations.

## Compilation laws

1. Core derives Demand backwards from all Targets through selected Candidates and Operation inputs.
2. Selection is already frozen into the graph; reachability alone determines work.
3. One Operation instance referenced by several edges is included once. Different instances are
   never content-deduplicated, even when implementation, parameters or input Records match.
4. A Provided-Value Candidate has no input edge, so traversal stops naturally. Core has no Pin,
   preview, cache or historical-result branch.
5. A Candidate must produce the exact nominal Type required by the Logical Output using it.
6. Cycles, missing references, undeclared ports, duplicate identities and incompatible Types fail
   before execution.
7. The resulting `svml.plan@1` is finite, deterministic and content-bound to the verified Graph and
   BuildRequest.

## Execution laws

1. Core emits Commands from the frozen BuildPlan. Driver and Runtime cannot change Candidate
   selection, dependency topology or Target meaning.
2. Records, Needs, Commands, Events, Receipts and Derivations are immutable content-bound facts.
3. A Derivation binds implementation identity, input and output digests, Need request digests and
   the accepted Event digest.
4. An external Receipt binds the exact Need, request digest, fulfillment implementation, output
   digest and accepted Event.
5. Serialized outstanding Commands are not trusted. Resume verifies accepted state, discards old
   commands and deterministically regenerates the next commands.
6. A Build completes only when every Target Record exists.

## Type laws

1. Types are nominally owned by modules, not registered in a central Core union.
2. Core checks the locked structural Schema for every admitted Record.
3. A Type owner may lock a semantic validator digest. When present, every Record of that Type needs
   a receipt bound to the exact Type, value digest and validator implementation.
4. The Graph owns dependencies, Derivation owns deterministic lineage and Receipt owns external
   fulfillment provenance.

## Boundary

`@narratage/protocol` owns wire data and identity. `@narratage/core` owns verification, Demand compilation and
state transitions. Compiler packages own source and graph construction. Runtime owns scheduling,
persistence and placement. Endpoint packages fulfill exact Capabilities. Domain packages own shared
vocabulary and validators.

Neither a file suffix, package name nor TypeScript class grants Kernel privilege. A domain package
released after Core can participate through manifests, nominal Types and ordinary Operations without
a Core release.

The Kernel has no privileged terminal output, Film root, video pipeline direction or single-Target
restriction.
