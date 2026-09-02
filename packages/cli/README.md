# `@hypit/cli`

Domain neutral commands for checking, planning, building and inspecting Hypit projects.

The command engine receives one explicit `CliDistribution`. A distribution supplies the compiler,
trusted bootstrap packages, source package discovery and the Runtime Host selected by a Runtime
Profile. The official video executable is assembled by `@hypit/video-cli`; another domain can
reuse this package without installing video packages.

Source imports decide which language and component packages give the source meaning. The Runtime
Profile separately selects the Host and environment packages allowed to execute work. The CLI does
not invent targets, candidates or provider choices.

Human output is compact by default. `--json` emits a stable, bounded command view rather than raw
compiler, Runtime or Repository objects. `--verbose` adds bounded operational detail; it never turns
the command into an internal state dump.

The implementation follows those same boundaries: `command.ts` defines the exact semantic command
union, while argument parsing and option ownership live in `arguments.ts`; project Result
browsing/export lives under `commands/results.ts`; Runtime,
credential, package and deployment operations live under `commands/environment.ts`; active Build
observation is read-only code in `observation.ts`; and human rendering is separate from the explicit
machine-view union. `main.ts` resolves project and selected Runtime context separately from parsed
syntax, then dispatches these command groups. Result commands do not consult or construct a Runtime,
and the generic CLI cannot silently choose a physical Result Store or a Provider-specific login
flow.
