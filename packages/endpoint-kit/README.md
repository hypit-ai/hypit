# `@hypit/endpoint-kit`

SDK for packages that fulfill exact external capabilities.

An endpoint can call a vendor API, local process, Lambda function, device or human service. An
endpoint package declares the capabilities it fulfills, its result types, credentials and scheduling
limits, then installs handlers into a Host registrar.

Immediate endpoints return a result directly. Asynchronous endpoints implement `start`, `poll` and
optional best effort `cancel`. Provider-total and exact-capability resource limits control concurrency
without changing Core demand. Each resource declares a `limit` and optional `units` (default 1).
A capability may add `resources` and a pure `unitsForRequest(request)` resolver for quantities of
already declared resources. Runtime admits all claims atomically for one `fulfill-need` Command.

For asynchronous work, `failed` means the external job has ended or submission was definitely rejected.
Transport errors and local deadlines cannot prove that. Return `pending` with the same handle;
a pending `failure` records a local deadline while Runtime waits for remote termination. A poll with
`settling: true` observes the existing job and returns `settled` when it ends, without downloading output.
`cancel` returning `accepted`, `unsupported` or `too-late` does not release capacity. Only confirmed
cancellation or observed termination does. A lost submission acknowledgement may remain pending without
a handle; it must not trigger automatic resubmission or an automatic capacity release.

An individual immediate capability may declare `transient: true`. That permits a Runtime to use the
same handler in a disposable authoring execution with no Build, Result or recoverable Operation. It is a
Provider assertion that the call submits no paid generation and creates no external side effect; it is
independent of pricing metadata and does not promise byte-identical output. The default is Build-only,
and asynchronous capabilities cannot be transient. Its capacity limits apply within one disposable
session; capabilities that require durable quota shared with Builds stay Build-only.

Endpoint packages are selected by a Runtime Profile, never activated by author imports. This package
depends on no Node filesystem, scheduler implementation or video domain.

`supports` receives one complete support description. For an executing Need, concrete graph values
are already in `constraints`. During pre-Build planning, an upstream value that does not exist yet is
represented by a semantic `pendingInputs` slot instead. A Provider may use the slot's input and
media role to enforce support limits, but it never receives graph traversal rules or future bytes.
