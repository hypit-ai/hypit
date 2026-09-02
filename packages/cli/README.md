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
