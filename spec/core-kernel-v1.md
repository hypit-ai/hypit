# SVML Core Kernel v1

Status: current executable v2 contract.

Core is a domain-free Build compiler and verified state machine. It does not parse `.svml`, know
video concepts, execute implementations, choose a Provider endpoint, access credentials or own a
queue.

## Inputs

Core accepts immutable data:

- a resolved module closure and typed authored records;
- a complete `svml.graph@1` containing Logical Outputs, Candidates and atomic Operations;
- a `svml.build-request@1` containing one or more Targets and explicit non-primary Candidate
  bindings.

Graph construction, package resolution, source parsing, static Fragment expansion and runtime
Candidate attachment happen outside Core. Core verifies their results before using them.

The reference construction path is deliberately layered: an optional Frontend produces typed
authored Records and parser-independent component declarations; `@svml/elaborator` resolves those
declarations and expands locked Graph Fragments; `@svml/realization` may attach explicitly selected
external Candidates. None of those reference packages is required by this Kernel contract.

## Laws

1. A Logical Output is the stable author-visible result identity. Every Candidate belongs to one
   Logical Output and has exactly one root.
2. A Candidate root is either one immutable provided Value or one atomic Operation result. Core has
   no Pin, preview or provider-fallback branch.
3. A BuildRequest selects a Candidate by id. An unbound output selects its declared primary
   Candidate. Runtime state cannot silently change that choice.
4. Core compiles Demand backwards from all Targets. It resolves selected Candidates and their input
   references in one traversal and memoizes every demanded Operation by stable OperationId.
5. An Existing-Value Candidate has no input edge, so Demand ends naturally. Multiple Targets and
   multiple Candidates sharing one Operation demand that Operation once.
6. Every public Operation has one atomic result. Multi-value products are represented by one Product
   result followed by deterministic Projection Operations.
7. Graph types, structural schemas and declared affinity constraints are verified without teaching
   Core the meaning of a domain type.
8. A Type is nominally owned by its declaring module. Its structural Schema is always checked by
   Core. The owner may additionally lock a semantic validator digest; if it does, every admitted
   Record of that Type must carry a receipt bound to the exact Type, Record digest and validator
   digest. The Host executes the validator; Core only verifies the declaration and receipt.
9. Exactness is monotonic. Candidate fidelity and the worst input conformance form a floor that no
   later exact Producer or Provider response may improve.
10. Records, Needs, Commands, Events, Receipts and Derivations are content-bound immutable facts.
   Derivations bind implementation, input/output digests, Need request digests and accepted event
   digest.
11. Serialized outstanding Commands are not trusted. Resume verifies accepted state and regenerates
   the next Command from that state.
12. A BuildPlan is a deterministic, finite derivative of the verified Graph and BuildRequest. A
   Driver may schedule ready Commands, but cannot redefine Candidate selection or Demand.
13. A Build completes only when every Target's selected result exists with an accepted conformance.

## Boundary

The data-only Protocol owns identities and wire shapes. Core owns their canonical verification,
Demand compilation and state transitions. Drivers own execution and persistence. Runtime Profiles
own scheduler placement, stores and credentials. Provider packages bind an already explicit
CapabilityRef to one exact endpoint. Domain contract packages own shared vocabulary such as
Narrative, ProgramSpace and Track.

Type validation does not centralize domain Types in Core. The declaring package owns the Schema and
optional validator identity; Producers and Consumers communicate only through the exact `TypeRef`.
The reference `@svml/validation` Host executes trusted validators and issues deterministic receipts.
Such a receipt proves consistency inside the trusted Host boundary, not execution safety or remote
authenticity of arbitrary plugin code. Sandboxing and attestation are Runtime concerns.

Neither a package suffix nor a TypeScript class grants Kernel privilege. A domain package can be
released after Core and participate through manifests, schemas and ordinary Operations without a
Core release.
