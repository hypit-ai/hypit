# `@hypit/hypit/endpoint`

SDK for packages that fulfill exact external capabilities.

External Provider packages import this public subpath from the `@hypit/hypit` Distribution. Use `@hypit/hypit` as
a development dependency, compile the Provider to JavaScript, and ship its code plus any ordinary
runtime dependencies. The active Distribution supplies this API when loading the package.
No Hypit checkout is needed to develop or install the extension.

```ts
import { defineEndpoint } from "@hypit/hypit/endpoint";
import type { AsyncEndpoint, CredentialRef, EndpointRequest } from "@hypit/hypit/endpoint";
import { generationTypes, sealGeneratedImageSet } from "@hypit/generation";
import { materializeWireRequest, planWireRequest } from "@hypit/generation/provider";
```

The shipped [project Provider example](../../examples/provider-package/README.md) follows an image
request through configuration, support, upload, submission, receipt, polling, collection and pricing.
It uses an explicitly illustrative service protocol and imports only public SDK subpaths.
This SDK also exports `canonicalize`, `BlobRef`, `ResourceId`, `credentialRef` and
`isStreamingResourceStore` for Providers that construct stored results or use streaming resource IO.

For an existing model, name its exact versioned Capability and expected result Type. Map its request
ports into the service's wire format; the Provider need not import the model's implementation.
`@hypit/generation` supplies the common generated-media values and optional wire-mapping helpers.
One Provider can implement multiple capabilities, and another Provider can implement those same
capabilities. The Profile selects the implementation used by a project.

An endpoint can call a vendor API, local process, device or human service. A Provider package creates
one configured Endpoint instance with `defineEndpoint`, declaring the capabilities it fulfills, its
result types, credentials and scheduling limits, then installs handlers into a Host registrar. The
configured instance is not itself a package: ordinary package management owns the Provider package,
while the Runtime Profile owns instance identity and configuration.

Immediate endpoints return a result directly. Asynchronous endpoints implement `start`, `poll` and
optional best effort `cancel`. Provider-total and exact-capability resource limits control concurrency
without changing Core demand. Each resource declares a `limit` and optional `units` (default 1).
A capability may add `resources` and a pure `unitsForRequest(request)` resolver for quantities of
already declared resources. Runtime admits all claims atomically for one `fulfill-need` Command.

A running immediate call or asynchronous action can report its current activity with
`await context.reportProgress?.({ phase: "processing", completed: 12, total: 40, unit: "items" })`.
The Provider chooses meaningful phases and quantities and reports non-secret, human-readable facts.
The Runtime attaches them to the currently executing Command; they do not change its outcome,
scheduling or Core facts. Completion clears the live activity. Direct callers may omit the callback.
For asynchronous work, these callbacks describe work inside `start`, `poll` or `collect`, such as
preparing references or downloading results. A returned `pending.progress` describes the acknowledged
remote task between actions. Neither form of progress substitutes for a received task ID or receipt.

Separate facts available from the request from actions needed to fulfill it. Check known input
limits and determine the requested service operation before transferring its resources. If the
service exposes account-specific capability information, use that evidence for the selected request;
an API without such a query needs no invented discovery step. A Provider owns the meaning of its
public error codes and reasons. Preserve the failed operation and that evidence, distinguishing what
was never submitted from a submission whose remote outcome is unknown.

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

These are example deployment choices, not model limits. `defineEndpoint` scopes their resource
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

Endpoint instances are selected by a Runtime Profile, never activated by author imports. This package
depends on no Node filesystem, scheduler implementation or video domain.

HTTP is one optional Provider mechanism, not part of the generic Endpoint protocol. HTTP Providers
import deadlines, Retry-After parsing and structured transport observations from
`@hypit/hypit/endpoint/http`. Those helpers report what one request attempt observed; they do not
choose whether catalogue lookup, submission, polling or collection should retry. The Provider owns
that phase-specific decision and the meaning of every service response.

`pricing: { kind: "local" }` explicitly declares work on this machine without a Provider call charge.
`pricing: { kind: "page", url }` identifies published pricing information; it does not determine an
account's eventual bill. An absent declaration leaves pricing unknown. Callers can summarize explicit
no-charge work while keeping unknown pricing and Endpoint selection failures visible.

An Endpoint may also expose `readPricing`. It receives the same complete `EndpointRequest` used for
the selected Endpoint's support check and resolves only that Endpoint's declared credentials when its source requires
them. The Provider returns current pricing documents together with their source URLs. Their data shape
belongs to the Provider: one service may return a model rate card, another a broader mixed catalogue,
and another may expose only its declared pricing page. Hypit preserves the material instead of
inventing a shared rate-table taxonomy, interpreting formulas, calculating totals, or turning pricing
information into spending authority.

An `EndpointPricingDocument` may add a concise `summary` for the default human view. It should retain
the published rates, units and applicable conditions. The Provider owns this description because it
knows its API's price fields and which fields merely describe marketing comparisons. The original
`data` remains available in JSON and verbose output. Without a summary, the CLI displays the data.

Use the Provider's execution mapping and the complete request parameters to narrow published material.
Preserve applicable units and conditions. A blocked graph dependency is an `EndpointDemand`, not a
partial `EndpointRequest`, so it exposes only the selected Endpoint's static pricing declaration;
`readPricing` is deferred until the Producer emits a complete request. Pricing readers receive no graph
to traverse. Requests sharing a catalogue lookup can share that read inside the Provider, whose API
determines what can be cached together.

Four facts remain separate at this boundary:

- the `EndpointDemand` declares a capability and return Type that need a deployment;
- the `EndpointRequest` describes the work selected by the current Invocation;
- an `EndpointPricingDocument` describes prices published by that Provider;
- spending authority belongs to the user's decision about the described work and cost.

Deployment selection uses only the demand and Runtime Profile binding. It never asks several Providers
to inspect a request and then chooses whichever accepts it. After one Endpoint is selected, the caller
can place its support and pricing evidence beside the request for an Agent to explain. Submission
continues to follow the user's authority.

`supports` receives only a concrete request after its Producer has consumed every graph input and
emitted a Need. If an upstream value does not exist yet, there is no Endpoint request to inspect;
planning reports the blocked Record dependency instead. `supports` returns either `supported`, or
`unsupported` with the selected Provider's reason. Inspection preserves that reason without
interpreting request fields or maintaining a central limitation table.

An Endpoint can additionally emit explicit, non-secret diagnostics:

```ts
await context.reportDiagnostic?.({ level: "info", message: "Encoder initialized" });
```

The Runtime binds each message to this call's Build, Command and Endpoint and owns persistence.
The Provider does not select a log path or Result repository. Messages describe operational evidence;
credentials, request bodies and opaque vendor payloads remain private. `reportProgress` continues to
report current activity; repeated counters are not an append-only log. Phase names belong to the Provider.
