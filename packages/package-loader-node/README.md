# `@hypit/package-loader-node`

Loads installed Hypit packages selected by source discovery or a Runtime Profile.

The user's package manager owns installation, versions and package bytes. This loader resolves only
the requested packages. An implementation package selected by Source discovery or a Runtime
Profile may expose `hypit.activation`; the loader imports that entry and validates the contribution
boundary consumed by Hypit. It never scans the dependency tree for plugins and is not a package
manager or registry.

A data-only package may instead expose an exact Source subpath through ordinary package `exports`.
The Host can resolve that one requested file without importing `hypit.activation` or granting the
package executable authority. Package-internal relative Sources and assets remain confined to the
package root. Executable activation and Source-data lookup are deliberately separate operations.

Module dependencies declared by selected packages are loaded from ordinary installed dependencies.
Syntax, components and Runtime facets remain inert until a matching Host ABI consumes them.

Physical lookup distinguishes package identity, ESM imports, package resources and npm executables.
It does not use a CommonJS root export as evidence that a package is installed: CLI-only,
import-only and resource-only packages are valid. The active Distribution owns `@hypit/*`;
Distribution code may use upstream dependencies from the machine npm home, while project packages
continue to resolve their own dependencies from the project.
