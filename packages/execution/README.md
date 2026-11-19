# @hypit/execution

Capability Invocation and Publication contracts, with a local Node 24 Execution Environment and loopback Host.

- `@hypit/execution` exposes the client, Invocation address, status, Publication and streamed resource contracts.
- `@hypit/execution/model` lets a Model package declare a request reader and named typed output readers.
- `@hypit/execution/provider` lets a Provider bind a Capability to job operations or a direct response.
- `@hypit/execution/node` opens the local Environment and serves it through the authenticated loopback ExecutionHost.

## Make a call

A deployment supplies its data root and explicit Endpoint bindings. The local root owns the Environment ID
in `environment.json`; reopening that root preserves the ID. A deployment can associate
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
worker and releases its root. Reopening it with the same directory and bindings resumes queued work and
active receipts. A Provider may implement read-only reconciliation by Invocation ID to recover an acknowledgement
lost during submission. If it cannot establish the Provider outcome, the Invocation ends with
`submission-unknown`. Check the Provider before starting a new Invocation.

Direct responses use the same staging and Publication commit. A direct Endpoint may checkpoint a service
receipt and reopen a previously accepted response through its read-only result lookup.

`cancel` confirms queued cancellation locally or records a running cancellation request for the Provider.
The observation reports confirmed, accepted, unsupported, too late or failed cancellation. Accepted requests
continue polling until the Provider reports a terminal outcome.

## Local ExecutionHost

`openNodeExecutionHost({ environments })` serves deployments on `127.0.0.1`. Each entry supplies an
Environment and optional account authorization operations. `listen()` returns the origin and a bearer token.
`new NodeExecutionHostClient(endpoint).environment(id)` exposes an Environment view with the same
`connect()` and `ExecutionClient` types. Closing the view releases its caller lifetime. Closing the server
closes deployments when constructed with `closeDeployments: true`. The client can use a local endpoint resolver when the deployment republishes
its address after a restart.

`GET /api/execution` lists the persisted Environment IDs at the selected endpoint. CLI commands can infer a sole
Environment. Use the exact ID from an Invocation address to reopen its Publication.

The loopback routes under `/api/execution/:environment` expose:

| Method and suffix | Operation |
| --- | --- |
| `GET /` | Environment identity and available Capability and Endpoint IDs. |
| `GET /doctor` | Deployment diagnostics with optional `capability` query. |
| `POST /quote` | JSON request and named resource metadata. |
| `POST /invocations` | Stream a typed request and named input bytes with the Node client. |
| `GET /invocations/:invocation` | Invocation observation. |
| `POST /invocations/:invocation/cancel` | Request cancellation. |
| `GET /invocations/:invocation/publication` | Publication manifest. |
| `GET /invocations/:invocation/resources/:output/:resource` | Stream a selected file. |
| `GET, DELETE /auth` | Observe or disconnect deployment authorization. |
| `POST /auth/attempt` and `GET, POST, DELETE /auth/attempt/:id` | Start, observe, complete or cancel authorization. |

The bearer token authorizes use of the selected deployment. Clients stream resources by name and open local
source and destination paths on their own side of the connection. The installed `hypit` CLI publishes and
discovers the runtime endpoint and provides shell commands for these operations.

## Storage

`invocations/<invocation-id>/invocation.json` checkpoints the request, phase, claims and Provider receipt.
Collection streams to private staging. The worker validates the output values against the Model capability,
moves the files into `publication/files/` and atomically commits `publication/manifest.json`. The manifest
binds named outputs to their types and resources. A restart can finish an interrupted commit from the
received checkpoint or poll and collect using the existing receipt. A lightweight SQLite lock releases
automatically when the writer process exits. Invocation and Publication data are ordinary files.
