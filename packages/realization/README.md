# `@svml/realization`

Internal content-addressed realization composition outside SVML Core.

A `svml.realization-overlay@2` is produced from a complete public `@svml/run` Run Graph when that
run contributes alternate implementations. It locks the exact Author Graph and contributes independent typed
Candidates plus any already elaborated Operations. It does not attach those Candidates to, or
rewrite, Author Logical Outputs. `resolveRealization()` merges one or more Run Graph overlays
deterministically, retains the Author Graph digest, records the complete Run Graph digest as the
realization identity, and produces the graph universe consumed by Build Compiler.

A Candidate is inert. It enters a finite BuildPlan only when a `BuildRequest` establishes an
explicit Satisfaction from a demanded Logical Output to that Candidate. The Satisfaction owns fidelity;
the Candidate owns only its Type and value/operation root. Product UI actions such as “Pin” create
or locate an Existing-Value Candidate and then write an ordinary substitute Satisfaction; they do
not mutate Core state or require a database.

`createBuildRecordCandidate()` is a Host convenience for this common case. It verifies the complete
prior `BuildState` only to extract a trusted typed Record, its type-validation receipt and optional
provenance. It returns an independent zero-input Candidate; the caller may use a substitute
Satisfaction to map it to any compatible Logical Output. The previous author Graph, prompt, semantic inputs and affinity are not
compatibility evidence and are not compared. No historical Operation, Command or outstanding work
is copied into the new Build.

The same model covers an uploaded video, a fixed black clip and any other already materialized
value. Core checks the Candidate Type/value on graph admission and checks it again against the
selected output. A `substitute` Satisfaction need not prove the current output's author affinity;
the BuildRequest must explicitly declare it and the
Target must explicitly accept substitute fidelity.
