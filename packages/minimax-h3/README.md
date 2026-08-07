# `@svml/minimax-h3`

Exact author/compute contracts for MiniMax H3 video generation.

Text, first/last-frame and subject-reference modes are separate endpoints rather than one dynamic
port mode. Each returns a provider-neutral `GeneratedVideoSet`. This package owns request semantics
and validation only; Provider calls, credentials, retries and queueing belong to a Runtime Endpoint
such as `@svml/provider-kie`.
