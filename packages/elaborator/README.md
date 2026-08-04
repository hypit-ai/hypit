# `@svml/elaborator`

Static Graph Fragment elaboration outside SVML Core.

A `svml.fragment@1` value may reference only declared Fragment inputs and local Operations. It
contains no JavaScript callback, ambient file lookup, credential access or Runtime endpoint. Before
expansion the Elaborator verifies producer ports, types, cycles, reachable exports, Semantic Input
Envelopes and affinity sources.

Expansion assigns hygienic identities from `fragment digest + author instance id + local id`.
Multiple exports of one instance therefore share internal Operations, while two explicit instances
are never content-deduplicated. The result is ordinary `LogicalOutput`, `Candidate` and
`OperationNode` data that Core validates again.
