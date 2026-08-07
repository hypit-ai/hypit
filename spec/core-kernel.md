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
- a `svml.build-request@1` containing Targets and explicit Satisfaction edges.

Graph construction, source parsing, package resolution, Fragment expansion and Run Graph authoring
happen outside Core. Core verifies the resulting data before deriving a plan.

## Graph values

1. A `LogicalOutput` is a stable author-visible promise: identity, nominal Type, Primary Candidate,
   semantic input envelope and optional affinity constraints.
2. A `Candidate` is an independent typed supply. Its root is one immutable Provided Value or one
   atomic Operation result. It does not belong to an output and does not carry fidelity.
3. A `Satisfaction` connects one Logical Output to one Candidate with `exact` or `substitute`
   fidelity. An output without an explicit Satisfaction uses its Primary Candidate as `exact`.
4. A `Target` names an output required by this Build and the worst conformance it accepts.
5. An `Operation` has stable instance identity, declared typed inputs and exactly one atomic result.
   Multi-result components use one Product followed by deterministic Projection Operations.

## Compilation laws

1. Core derives Demand backwards from all Targets through selected Candidates and Operation inputs.
2. Selection and reachability are resolved together; an undemanded Satisfaction does not create
   work.
3. One Operation instance referenced by several edges is included once. Different instances are
   never content-deduplicated, even when implementation, parameters or input Records match.
4. A Provided-Value Candidate has no input edge, so traversal stops naturally. Core has no Pin,
   preview, cache or historical-result branch.
5. A Candidate must produce the exact nominal Type required by every Satisfaction using it.
6. A Candidate's authored leaves must remain within that Logical Output's semantic input envelope.
7. Cycles, missing references, undeclared ports, duplicate identities and incompatible Types fail
   before execution.
8. The resulting `svml.plan@1` is finite, deterministic and content-bound to the verified Graph and
   BuildRequest.

## Execution laws

1. Core emits Commands from the frozen BuildPlan. Driver and Runtime cannot change Candidate
   selection, dependency topology or Target meaning.
2. Exactness is monotonic. Satisfaction fidelity, input conformance and external fulfillment form a
   floor that no later exact Producer can improve.
3. A Target accepting only `exact` rejects a selected or inherited `substitute` before completion.
4. Records, Needs, Commands, Events, Receipts and Derivations are immutable content-bound facts.
5. A Derivation binds implementation identity, input and output digests, Need request digests and
   the accepted Event digest.
6. An external Receipt binds the exact Need, request digest, fulfillment implementation, output
   digest, delivery mode, conformance and accepted Event.
7. Serialized outstanding Commands are not trusted. Resume verifies accepted state, discards old
   commands and deterministically regenerates the next commands.
8. A Build completes only when every Target Record exists with accepted conformance.

## Type and affinity laws

1. Types are nominally owned by modules, not registered in a central Core union.
2. Core checks the locked structural Schema for every admitted Record.
3. A Type owner may lock a semantic validator digest. When present, every Record of that Type needs
   a receipt bound to the exact Type, value digest and validator implementation.
4. Core affinity is a domain-neutral declared equality between JSON Pointer values on directly
   connected facts. It may not require every downstream value to copy transitive provenance.
5. The Graph owns dependencies, Derivation owns deterministic lineage and Receipt owns external
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
