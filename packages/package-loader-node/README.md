# `@narratage/package-loader-node`

Installed-package selection for Node Hosts. npm or pnpm owns installation, versions and byte
integrity. This loader imports only packages selected by Source discovery or a Runtime Profile,
then validates the contribution boundary Narratage consumes.

Exact Module Manifest dependencies (`ModuleRef + digest`) load from the selected package's installed
dependencies. The loader neither scans unrelated dependencies for plugins nor maintains a package registry.

This package does not select an author syntax. Syntax-specific executable facets remain inert until
an exact Host ABI installs them. `@narratage/compiler-markup-node` selects the official Markup Surface ABI;
`@narratage/runtime-local` can load the same package's deterministic compute facets without depending on Markup.
Run Fragment libraries use the ordinary `narratage.run-fragment-host@1` Host facet; the Loader has no
Run-specific fragment field or interpretation branch. Author and Run Frontends likewise use the
ordinary `narratage.source-frontend@1` Host facet; the Loader has no Frontend fields or parser registry.

This package is deliberately not an npm client. Source `<import>` can select only an already installed
author contribution. Provider and privileged Runtime packages are independently selected by a Runtime
Profile.

If `@example/cards` requires a Module exported by an installed dependency, that dependency does not
need another Source import. Missing or digest-mismatched Module providers fail before compilation.
