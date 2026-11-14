# `@hypit/project`

Portable Project Boundary identity shared by domain documents, services and Hosts. The main entry
owns only `ProjectObjectRef` and its exact portable validation; it has no filesystem dependency.

`@hypit/project/node` owns the local filesystem adapter. It resolves only the explicit or nearest
marked Project and provides project-member path utilities. It does not own the project's Runtime
pointer, load Providers, install programs, inspect credentials or select services.

`resolveProjectRoot({ projectRoot?, cwd? })` uses an explicit Project, otherwise the nearest
   `package.json` above cwd whose `hypit.project` is `true`. It never turns an arbitrary npm package or
   cwd into a Project. `findProjectRoot()` exposes the same discovery without requiring a Project.
   Author Source filenames do not choose the Project. After selection it returns the real filesystem
   path; symlinks do not redirect the preceding parent-project search.
Generation Runtime selection belongs to the selected Generation Runtime implementation. Its local package owns its
`.hypit/generation/runtime-profile` pointer and the commands that read, write or clear it; an entrypoint's explicit
`--runtime` remains a command-specific selection. Project resolution neither reads nor interprets a
Runtime Profile.

Project packages, the installed Distribution and machine-managed executables have different owners.
The Distribution supplies code; it does not supply a second project environment. Provider adapters
resolve their executable configuration and report availability through the Runtime's existing ports.

The Node entry validates absolute project members and resolves owner-relative references without allowing
them to escape the selected Project Boundary. These are filesystem adapter utilities shared by project services;
portable authored identity remains the `ProjectObjectRef` described below.

`ProjectObjectRef` addresses one persistent object by an exact `@1` document format and a portable path relative to
the selected root. It does not contain a filesystem absolute path, hash, display kind, historical locator or view state.
The format owner validates and opens the document; higher-level Production Context composition lives outside this
boundary package.
