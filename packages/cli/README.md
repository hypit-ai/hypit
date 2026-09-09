# `@hypit/cli`

Domain neutral commands for checking, planning, building and inspecting Hypit projects.

The command engine receives one explicit `CliDistribution`. A distribution supplies the compiler,
trusted bootstrap packages, source package discovery and its Runtime Host. The official video
executable assembles the Local Runtime through `@hypit/video-cli`; another application may provide
another Host without changing this package or pretending that a local Profile selected it.

Source imports decide which language and component packages give the source meaning. A Local Runtime
Profile separately selects Credential Stores and Endpoints allowed to execute work. The CLI does not
invent targets, candidates or Provider choices.

Human output is compact by default. `--json` emits a command-specific view rather than raw compiler,
Runtime or Repository objects. `--verbose` adds operational detail; it never turns the command into
an internal state dump.

`plan` lists every Endpoint request in the frozen Build graph. Exact-model packages expose their own
port tables and request-assembly edges, so the CLI can show authored prompt, duration and generation
settings without searching arbitrary records for a request-shaped object. When an input file will be
made by an earlier Build step, that direct graph edge stays symbolic until the file exists; the rest
of the request is still shown. A complete request is resolved through the same Endpoint Registry as
the Build, including the Endpoint's `supports` check.

`pricing <run>` uses that selected Runtime to read Provider-owned rate material. The default report
summarizes requests whose resolved Endpoint explicitly declares `pricing.kind: "local"` as having no
Provider charge. Requests with missing pricing declarations, failed price reads, or unresolved or
unsupported Endpoints remain visible. Names, model families and request parameters do not determine
whether work is free.

Matching capability, Endpoint and pricing material share one group. Each group shows shared request
parameters once and preserves the counts and combinations of varying parameters. A Provider's optional
document summary supplies the default rate display; otherwise the document itself is shown, or the
declared pricing page when no document is available. Documents retain the Provider's fields, units and conditions. The CLI
does not interpret formulas, infer upstream media properties, or calculate totals.

All groups are shown by default. `--limit <count>` limits human groups after grouping; `--verbose`
adds no-charge request details, full request names and original documents. JSON uses `hypit.cli-pricing@1`: `requestCount`
and `noChargeRequestCount` describe the whole Run, while `groups[]` holds Provider selection facts,
`requests[]` with known parameters and pending inputs, and `pricingDocuments[]` with source and data.
JSON includes every group regardless of `--limit`; no-charge requests are included with `--verbose`.

The implementation follows those same boundaries: `command.ts` defines the exact semantic command
union, while argument parsing and option ownership live in `arguments.ts`; project Result
browsing/export lives under `commands/results.ts`; Runtime,
credential, package and deployment operations live under `commands/environment.ts`; active Build
observation is read-only code in `observation.ts`; and human rendering is separate from the explicit
machine-view union. `main.ts` resolves project and selected Runtime context separately from parsed
syntax, then routes these command groups. Result commands do not consult or construct a Runtime,
and the generic CLI cannot silently choose a Result Repository or a Provider-specific login
flow.
