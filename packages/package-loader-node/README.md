# `@narratage/package-loader-node`

Loads installed Narratage packages selected by source discovery or a Runtime Profile.

The user's package manager owns installation, versions and package bytes. This loader resolves only
the requested packages, imports their declared `narratage.activation` entry and validates the
contribution boundary consumed by Narratage. It never scans the dependency tree for plugins and is
not a package manager or registry.

Module dependencies declared by selected packages are loaded from ordinary installed dependencies.
Syntax, components and Runtime facets remain inert until a matching Host ABI consumes them.
