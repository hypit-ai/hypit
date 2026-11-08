# `@hypit/temporal-graph`

Typed-graph adapter for the values owned by `@hypit/temporal`.

The package contributes nominal Type identities, canonical Value schemas and Refinement facets for
long-running graph packages that exchange exact temporal values. It owns no temporal arithmetic and
publishes no generic temporal Producers. A domain package owns every graph operation it actually needs
and calls the pure temporal algebra from its own handler.

Direct NLE, Caption, Script and execution code depend on `@hypit/temporal`, not this adapter.
