# `@hypit/build-cli`

Command adapter for long compilation and execution.

The package binds Author compilation, Runtime inspection and execution, Run history and Product
services to the `check`, `plan`, `build`, observation and Result commands. `@hypit/cli` owns only
terminal hosting and command dispatch; this adapter owns the long-running product vocabulary.

The current implementation delegates to the existing command engine while its domain-specific
parsing and presentation files move out of the Host package. That implementation migration does not
change the command-module ABI or executable composition.
