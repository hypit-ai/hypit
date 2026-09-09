# `@hypit/hypit/endpoint-kit`

SDK for packages that fulfill exact external capabilities.

External Provider packages import this public subpath from the `@hypit/hypit` Distribution. Use `@hypit/hypit` as
a development dependency, compile the Provider to JavaScript, and ship its code plus any ordinary
runtime dependencies. The active Distribution supplies this API when loading the package.
No Hypit checkout is needed to develop or install the extension.

```ts
import { defineEndpointPackage } from "@hypit/hypit/endpoint-kit";
import type { AsyncEndpoint, CredentialRef, EndpointRequest } from "@hypit/hypit/endpoint-kit";
import { generationTypes, compileWireRequest, sealGeneratedImageSet } from "@hypit/hypit/generation";
```

For an existing model, name its exact versioned Capability and expected result Type. Map its request
ports into the service's wire format; the Provider need not import the model's implementation.
`@hypit/hypit/generation` supplies the common generated-media values and optional wire-mapping helpers.
One Provider can implement multiple capabilities, and another Provider can implement those same
capabilities. The Profile selects the implementation used by a project.

An endpoint can call a vendor API, local process, Lambda function, device or human service. An
endpoint package declares the capabilities it fulfills, its result types, credentials and scheduling
limits, then installs handlers into a Host registrar.

Immediate endpoints return a result directly. Asynchronous endpoints implement `start`, `poll` and
optional best effort `cancel`. Provider-total and exact-capability resource limits control concurrency
without changing Core demand. Each resource declares a `limit` and optional `units` (default 1).
A capability may add `resources` and a pure `unitsForRequest(request)` resolver for quantities of
already declared resources. Runtime admits all claims atomically for one `fulfill-need` Command.

Asynchronous execution moves forward through `start`, `poll`, and optional `collect`. `start` returns
a task handle; `pending` means an acknowledged task is still running. `ready` records remote completion
and hands its artifacts to `collect`, allowing download capacity to differ from task capacity.
An Endpoint may return `completed` directly when no separate collection is needed.

A `failed` outcome or thrown error ends the local execution attempt. This does not assert that the
remote job ended. A submission timeout with no receipt is a failure, not a pending task to reconcile.
`context.checkpoint` saves an acknowledgement before subsequent work; public `receipt` fields contain
non-secret task identifiers suitable for inspection and Result retention. Opaque `handle` remains
Provider-owned execution data. Explicit cancellation is best effort; `accepted`, `unsupported` and
`too-late` are recorded acknowledgements, not proof of remote termination.

For asynchronous capabilities, `actionLimits` configures `submit`, `poll` and `collect` separately:

```ts
actionLimits: {
  submit: { concurrency: 2, rate: { limit: 1, periodMs: 200 } },
  poll: { concurrency: 8 },
  collect: { concurrency: 2 },
}
```

These are example deployment choices, not model limits. `defineEndpointPackage` scopes their resource
identities to the declared pool; custom `actions` can instead supply explicit shared resource claims.
`concurrency` holds units until that action returns. A rate budget starts with `limit` permits,
replenishes `limit` permits per `periodMs`, and spends one permit per admitted action. One action may
make several HTTP requests; Provider transport policy owns those individual requests. Whole-operation
resources describe occupancy. Core contains neither these phases nor any Provider names.

An individual immediate capability may declare `transient: true`. That permits a Runtime to use the
same handler in a disposable authoring execution with no Build, Result or recoverable Operation. It is a
Provider assertion that the call submits no paid generation and creates no external side effect; it is
independent of pricing metadata and does not promise byte-identical output. The default is Build-only,
and asynchronous capabilities cannot be transient. Its capacity limits apply within one disposable
session; capabilities that require durable quota shared with Builds stay Build-only.

Endpoint packages are selected by a Runtime Profile, never activated by author imports. This package
depends on no Node filesystem, scheduler implementation or video domain.

`pricing: { kind: "local" }` explicitly declares work on this machine without a Provider call charge.
`pricing: { kind: "page", url }` identifies published pricing information; it does not determine an
account's eventual bill. An absent declaration leaves pricing unknown. Callers can summarize explicit
no-charge work while keeping unknown pricing and Endpoint selection failures visible.

An Endpoint may also expose `readPricing`. It receives the same complete `EndpointRequest` used for
support selection and resolves only that Endpoint's declared credentials when its source requires
them. The Provider returns current pricing documents together with their source URLs. Their data shape
belongs to the Provider: one service may return a model rate card, another a broader mixed catalogue,
and another may expose only its declared pricing page. Hypit preserves the material instead of
inventing a shared rate-table taxonomy, interpreting formulas, calculating totals, or turning pricing
information into spending authority.

An `EndpointPricingDocument` may add a concise `summary` for the default human view. It should retain
the published rates, units and applicable conditions. The Provider owns this description because it
knows its API's price fields and which fields merely describe marketing comparisons. The original
`data` remains available in JSON and verbose output. Without a summary, the CLI displays the data.

Use the Provider's execution mapping to select the upstream model and the request's known parameters
to narrow the published material when the service supports it. Preserve applicable units and
conditions. A future media input supplies its declared slot and role, not its eventual duration or
other measured properties. Pricing readers receive no graph to traverse; incomplete usage still
allows returning the model's rate information. Requests sharing a catalogue lookup can share that read
inside the Provider, whose API determines what can be cached together.

Three facts remain separate at this boundary:

- the `EndpointRequest` describes the work selected by the Run;
- an `EndpointPricingDocument` describes prices published by that Provider;
- spending authority belongs to the user's decision about the described work and cost.

The caller can place the first two beside each other for an Agent to calculate and explain. Request
selection continues to follow the Runtime Profile and Endpoint support, while submission continues to
follow the user's authority.

`supports` receives one complete support description. For an executing Need, concrete graph values
are already in `constraints`. During pre-Build planning, an upstream value that does not exist yet is
represented by a semantic `pendingInputs` slot instead. A Provider may use the slot's input and
media role to enforce support limits, but it never receives graph traversal rules or future bytes.
It returns either `supported`, or `unsupported` with the Provider's reason. Selection infrastructure
preserves that reason without interpreting request fields or maintaining a central limitation table.
