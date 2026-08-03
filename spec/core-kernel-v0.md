# SVML Core Kernel v0

Status: executable bootstrap contract; deliberately incomplete.

Core v0 is a domain-free verifier and deterministic state reducer. It does not parse source,
resolve package locations, execute implementations, access an artifact store, call providers,
or search the global producer set for a path to a goal.

## Laws

1. Every referenced module, type and producer belongs to one immutable resolved closure.
2. Records are immutable. Only a Frontend-created typed module may introduce authored origin;
   producer and fulfillment events may append only derived or observed records.
3. Every missing external value is represented by a typed `Need` with explicit constraints and
   an exact/substitute acceptance rule.
4. Every appended record has an origin that reaches an authored record, producer derivation or
   fulfillment receipt.
5. A build executes only the finite steps in its explicit plan. Core never ranks or discovers
   an undeclared producer.
6. State and events are canonical data. Replaying an accepted event is idempotent, and a paused
   state can be serialized and resumed without semantic change.

## Boundary

Core owns linking, nominal type identity, structural value validation, plan validation,
state transitions and provenance verification.

The Node Driver owns manifest I/O, registered implementation execution, requirement handlers,
artifact bytes, journaling and pause/resume orchestration. Core emits commands; it never executes
them.

Frontend selection, `.svml`, `.svs`, Import Prologue and Surface Parser execution are explicitly
outside Core v0 and Driver v0. The data-only Protocol may declare a Surface in a Module Manifest,
and Core verifies its identity/mode/digest as ordinary closure data; this does not give Core any
source syntax or parser dispatch behavior.
