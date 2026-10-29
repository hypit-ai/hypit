# `@hypit/loader`

## Installed ownership

The Distribution's public exports into its internal `packages/` identify embedded host modules.
An unrelated directory in a development checkout is not embedded ownership. Independent packages
remain ordinary project-overridable dependencies in both development and installed releases.

A product may explicitly name dependency owners with `hypit.packageSources` in its package.json.
Each name must be a declared dependency. Lookup uses those installed package locations after project
selection; it does not scan for plugins, install anything or activate an owner merely to locate bytes.
Logical Module dependencies are resolved from the package that declares them.

Defines the package contribution value consumed by Hypit Hosts. It contains logical Modules and
opaque Facets, but no package-manager policy or platform I/O. `verifyPackageContributions()` checks
the selected declarations without interpreting executable Facets.

## Node Host

`@hypit/loader/node` loads installed Hypit packages selected by Source discovery or a Runtime
Profile.

The user's package manager owns installation, versions and package bytes. This loader resolves only
the requested packages. An implementation package selected by Source discovery or a Runtime
Profile may expose `hypit.activation`; the loader imports that entry and validates the contribution
boundary consumed by Hypit. It never scans the dependency tree for plugins and is not a package
manager or registry.

A data-only package may instead expose an exact Source subpath through ordinary package `exports`.
The Host can resolve that one requested file without importing `hypit.activation` or granting the
package executable authority. Package-internal relative Sources and assets remain confined to the
package root. Executable activation and Source-data lookup are deliberately separate operations.

The root CLI Host similarly resolves only command-module exports named by the Distribution or
project `package.json`. `resolveNodePackageModule` follows the exact npm export (including its
`import` condition) without scanning dependencies; importing the resolved module is the Host's
separate, explicitly authorized action.

Module dependencies declared by selected packages are loaded from ordinary installed dependencies.
Syntax, components and Runtime facets remain inert until a matching Facet ABI consumes them.

Physical lookup distinguishes package identity, ESM imports, package resources and npm executables.
It does not use a CommonJS root export as evidence that a package is installed: CLI-only,
import-only and resource-only packages are valid. The active Distribution protects the exact embedded
packages it owns. Independently published `@hypit/*` packages and third-party dependencies remain
ordinary npm dependencies: project packages resolve from the project, and embedded Distribution code
resolves from the Distribution installation. The loader reports absent dependencies and never installs
or upgrades them.

## Execution-owned module scopes

`NodePackageLoadOptions.importModule` lets the Host own module lifetime while package selection and
contribution validation stay here. The default uses ordinary process imports. The local execution
Host creates one module importer for each Build: selected project packages and their transitive
JavaScript dependencies receive scope-local module identities. Only public exports and exact packages
physically embedded by the active Distribution remain shared process code; npm scope alone grants no
such ownership. Registries and configured adapter instances are still created per Build.

The public `createNodeModuleImporter()` factory returns only `import()` and `close()`; the Loader keeps
its scope class and CommonJS bridge private. The implementation uses Node resolution/loading hooks and
transpiles scope-owned TypeScript/TSX. Its CommonJS
bridge has a scope-owned module cache, Node-style named-export discovery and synchronous evaluation;
Node's VM dynamic-import support is enabled only for the execution carrier. Public paths such as
`import.meta.url`, `__filename` and relative asset reads remain real filesystem locations. Module
identity URLs are internal names; no copied source directory is created. Closing a scope drops its
live lookup and CommonJS table; the Host retires an empty carrier to release Node's ESM cache.

This is trusted execution, not a sandbox. Builtins, native libraries and process-global state
(including `process.cwd()` and `process.env`) remain shared. Existing module bindings do not change
under an active Build; a file or dependency first
read later uses ordinary filesystem semantics. Scoped loading does not make a project tree immutable.
