# `@hypit/project`

Shared project and Runtime selection for Node entrypoints: CLI, Studio and creation tools.
This package resolves locations and reads or explicitly changes the project's Runtime pointer.
It does not load Providers, install programs, inspect credentials or select services.

1. `resolveProjectRoot({ projectRoot?, cwd? })` uses an explicit Project, otherwise the nearest
   `package.json` above cwd whose `hypit.project` is `true`. It never turns an arbitrary npm package or
   cwd into a Project. `findProjectRoot()` exposes the same discovery without requiring a Project.
   Author and Invocation Source filenames do not choose the Project. After selection it returns the real filesystem
   path; symlinks do not redirect the preceding parent-project search.
2. `findRuntimeProfile(projectRoot)` reads only that project's `.hypit/runtime` file and resolves its
   path relative to the project. An entrypoint's explicit `--runtime` overrides this read for that invocation.
3. The selected Runtime implementation interprets the Profile, including `dataRoot`, Credentials,
   Providers and capability bindings. This package does not interpret its contents.

`selectRuntimeProfile(projectRoot, profile)` writes the explicit choice; `clearRuntimeProfile` removes
only that pointer. A directory occupying the pointer path is reported without replacing it. Runtime
working data belongs at the Profile's separate `dataRoot`.

Project packages, the installed Distribution and machine-managed executables have different owners.
The Distribution supplies code; it does not supply a second project environment. Provider adapters
resolve their executable configuration and report availability through the Runtime's existing ports.
