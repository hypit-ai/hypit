# `@narratage/minimax-h3`

Exact author/compute contracts for MiniMax H3 video generation.

Text, first/last-frame and subject-reference modes are separate endpoints rather than one dynamic
port mode. Each returns a provider-neutral `GeneratedVideoSet`. This package owns request semantics
and validation only; Provider calls, credentials, retries and queueing belong to a Runtime Endpoint
such as `@narratage/provider-kie`.

The package is directly activatable and intentionally exposes exact compute Fragments. A separate author
kit may provide prettier domain syntax without moving model semantics into a Provider.
