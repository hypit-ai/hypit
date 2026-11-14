# `@hypit/execution-environment-local`

The local Execution Environment Host. It connects installed Endpoint and Credential Store adapters,
credentials, managed Programs and direct capability invocation without creating a Generation Build,
Worker, Result or execution database.

`LocalExecutionEnvironmentDeployment` is the opened deployment boundary. It reads one
`hypit.execution-environment-local@1` Profile, resolves its Environment data root, discovers the
selected Adapter packages, activates Endpoints, applies capability bindings and opens only the
Credential Stores required by the selected Endpoints. Scoped deployments share one Adapter registry
but do not invent persistent deployment state or cache Provider observations.

`openLocalExecutionEnvironmentHost()` exposes that deployment through one headless application API:

- `endpoints()` and `pricing()` project Endpoint selection and Provider-owned pricing;
- `preflight()` and `doctor()` inspect the selected deployment slice;
- `openCredentials()` opens credential status and mutation for exactly one Endpoint;
- `invoke()` executes one immediate `CapabilityInvocationRequest` without Generation identities;
- `declaredPrograms()` supplies the environment-owned Program lifecycle implementation.

The Host owns no project document and writes no NLE, Media, Transcript or Scene fact. The calling
domain action accepts the returned value into its own owner. It also owns no Generation graph,
scheduler, Build history, publication store or Executor. A Generation Runtime may reference and
consume the same Host through its own Profile, but is not its parent.

CLI adapters can address the Environment directly:

```bash
hypit doctor --environment ./hypit.environment.json
hypit auth status hypihub.default --environment ./hypit.environment.json
hypit auth login hypihub.default --environment ./hypit.environment.json
hypit programs status --environment ./hypit.environment.json
hypit programs prepare --environment ./hypit.environment.json --endpoint whisperx.local
```

A Runtime Profile remains a convenient indirect selector for Generation commands. Desktop, Codex,
Workbench and CLI should project this same Host API rather than implement separate Provider login or
Endpoint resolution. Their own product-account login is a different authority.

The package also owns managed-program declarations, local credential control and process/log/lock
primitives. Whether the Host is embedded in a CLI process or held by a longer-lived Project Host is
deployment topology, not part of the Environment Profile.

Program preparation, startup, status and shutdown operate on the Environment Profile directly. The
Program owner supplies installation commands, readiness probes and an optional start command. Hypit
keeps installation and service logs in that Program's Environment state directory, and uses an OS-owned
lifecycle lock plus a PID record only for processes it started. These are deployment facts: they never
enter a Generation Build, Result, project document or media manifest.
