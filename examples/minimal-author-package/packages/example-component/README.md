# Example component fixture

This is the smallest complete author-package fixture. It is the canonical generic-package reference,
not a production component or a video example. Framework-facing imports come from
`hypit/author-kit`; video-domain imports use their owning `hypit/*` subpaths. The package has one
development dependency on the released Hypit Distribution and no Runtime dependency bundled into
its tarball.

It contains a Module Manifest with nominal Types and deterministic Producers, validators, a structured
Surface decoder returning `records`, `components`, `fragments` and `exports`, and sealed Fragments with
literal `fragment-input`, `fragment-operation` and `output` references. `src/temporal.ts` shows the
Surface-side `@hypit/temporal-markup` Window/Moment projections; that package is distinct from the
graph-side `@hypit/temporal` Producers.

The Surfaces demonstrate a box, a text surface, a media slot and a Style decoder. The slot is a graph
input; it is not a file bundled by the package. `preview/Box.png` is a real catalogue frame supplied
by the package's vocabulary. `exampleAppendFragment` and `append-example-items` show a fixed-port
append that can be chained once per child.

While the component belongs to one project, keep this directory under that project's `packages/`
and use its owner-scoped package name. If the owner chooses to share it, compile and publish the same
package through npm or a private registry. Consumers install a chosen release with their ordinary
package manager and commit the resulting lockfile. The Source's logical Module import remains the
same whether the package is linked from the project workspace or installed from a registry.
