# `@narratage/transport`

Tiny transport contracts with no capability identity, scheduling or recovery authority.

`JsonInvoker` carries one bounded canonical request/response exchange. Process, Lambda, HTTP or RPC
adapters may implement it; an Endpoint package remains responsible for interpreting the request,
persisting remote checkpoints and converting a response into an exact capability fulfillment.
