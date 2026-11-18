# @hypit/execution

Capability Invocation and Publication contracts, with a local Node 24 Execution Environment.

- `@hypit/execution` exposes the client, Invocation address, status, Publication and streamed resource contracts.
- `@hypit/execution/model` lets a Model package declare a request reader and named typed output readers.
- `@hypit/execution/provider` lets a Provider bind a Capability to job operations or a direct response.
- `@hypit/execution/node` opens the local Environment over a dedicated data directory.

## Make a call

A deployment supplies the Environment ID, its data root and explicit Endpoint bindings. It can associate
a binding with several named occupancy budgets, such as an account and a model. Every call acquires its
budgets together. They are held through submission and remote polling, and released for collection.
Recovered remote jobs keep their claims while they are polled. Use a common capacity name for Endpoint
bindings sharing the same upstream limit. A root has one live owner process.

From an open Environment use `environment.connect()`, or register it with
`bindApplicationExecutionEnvironment` and obtain a client from `projectHost.executionClient(environmentId)`.
The deployment controls which Projects receive a lease. A granted client can use exact Invocation addresses
in that Environment. It is intended for callers trusted to use that Environment's account and outputs.

1. `capabilities()` shows selectable Capability and Endpoint IDs. Select an Endpoint explicitly if a Capability has several.
2. `start({ capability, input, endpoint? })` validates and durably queues the request. For media inputs pass
   named byte sources in `start` options. The Model validates their required roles and types. The Environment
   retains those bytes while the Invocation is active.
3. Save the returned address anywhere the calling program will need it. `get` observes the phase and public
   Provider task ID. `wait` waits for a terminal phase. Its abort signal only stops that wait.
4. `publication(address)` reads the completed output manifest. `openResource(address, output, resource)`
   returns a byte stream, size and media type for a selected file. Feed its bytes to the target owner explicitly.

Closing a client lease leaves accepted Invocations with the Environment. Closing the Environment stops its
worker and releases its root. Reopening it with the same ID, directory and bindings resumes queued work and
active receipts. A Provider may implement read-only reconciliation by Invocation ID to recover an acknowledgement
lost during submission. If it cannot establish the Provider outcome, the Invocation ends with
`submission-unknown`. Check the Provider before starting a new Invocation.

Direct responses use the same staging and Publication commit. A direct Endpoint may checkpoint a service
receipt and reopen a previously accepted response through its read-only result lookup.

`cancel` confirms queued cancellation locally or records a running cancellation request for the Provider.
The observation reports confirmed, accepted, unsupported, too late or failed cancellation. Accepted requests
continue polling until the Provider reports a terminal outcome.

## Storage

`invocations/<invocation-id>/invocation.json` checkpoints the request, phase, claims and Provider receipt.
Collection streams to private staging. The worker validates the output values against the Model capability,
moves the files into `publication/files/` and atomically commits `publication/manifest.json`. The manifest
binds named outputs to their types and resources. A restart can finish an interrupted commit from the
received checkpoint or poll and collect using the existing receipt. A lightweight SQLite lock releases
automatically when the writer process exits. Invocation and Publication data are ordinary files.
