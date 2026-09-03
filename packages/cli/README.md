# `@hypit/cli`

Domain neutral commands for checking, planning, building and inspecting Hypit projects.

The command engine receives one explicit `CliDistribution`. A distribution supplies the compiler,
trusted bootstrap packages, source package discovery and its Runtime Host. The official video
executable assembles the Local Runtime through `@hypit/video-cli`; another application may provide
another Host without changing this package or pretending that a local Profile selected it.

Source imports decide which language and component packages give the source meaning. A Local Runtime
Profile separately selects Credential Stores and Endpoints allowed to execute work. The CLI does not
invent targets, candidates or Provider choices.

Human output is compact by default. `--json` emits a stable, bounded command view rather than raw
compiler, Runtime or Repository objects. `--verbose` adds bounded operational detail; it never turns
the command into an internal state dump.

The implementation follows those same boundaries: `command.ts` defines the exact semantic command
union, while argument parsing and option ownership live in `arguments.ts`; project Result
browsing/export lives under `commands/results.ts`; Runtime,
credential, package and deployment operations live under `commands/environment.ts`; active Build
observation is read-only code in `observation.ts`; and human rendering is separate from the explicit
machine-view union. `main.ts` resolves project and selected Runtime context separately from parsed
syntax, then routes these command groups. Result commands do not consult or construct a Runtime,
and the generic CLI cannot silently choose a Result Repository or a Provider-specific login
flow.
