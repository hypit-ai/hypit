# `@hypit/project`

Shared project-root selection for Node entrypoints: CLI, Studio and creation tools.
This package resolves only the explicit or nearest marked Project. It does not own the project's
Runtime pointer, load Providers, install programs, inspect credentials or select services.

1. `resolveProjectRoot({ projectRoot?, cwd? })` uses an explicit Project, otherwise the nearest
   `package.json` above cwd whose `hypit.project` is `true`. It never turns an arbitrary npm package or
   cwd into a Project. `findProjectRoot()` exposes the same discovery without requiring a Project.
   Author and Invocation Source filenames do not choose the Project. After selection it returns the real filesystem
   path; symlinks do not redirect the preceding parent-project search.
Runtime selection belongs to the selected Runtime implementation. The local Runtime package owns its
`.hypit/runtime` pointer and the commands that read, write or clear it; an entrypoint's explicit
`--runtime` remains an invocation-level selection. Project resolution neither reads nor interprets a
Runtime Profile.

Project packages, the installed Distribution and machine-managed executables have different owners.
The Distribution supplies code; it does not supply a second project environment. Provider adapters
resolve their executable configuration and report availability through the Runtime's existing ports.
