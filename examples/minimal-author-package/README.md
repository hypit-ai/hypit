# Minimal author-package fixture

Use this directory only as the generic author-package fixture. It is deliberately not a complete video
project: the `packages/example-component` package is the authoritative small implementation, while
the package's `preview/` asset demonstrates a Surface preview. The fixture also includes a Style
Surface that reads an SVS Recipe and exact FontStackRef.

The fixture's Surface decoder also demonstrates the public value boundary: Style-like values consume
a decoded recipe shaped as `{ path, properties }`, exact `FontStackRef` records and inline values
only after checking `record.value.kind === "inline"`. Media slots remain graph inputs rather than
package files.

The package builds against the single public `hypit` development dependency and emits JavaScript.
`pnpm --dir packages/example-component pack` produces a tarball with no Runtime dependencies of its
own. Installing that tarball in another project and importing `@example/example-component@1` loads
the same Module and Surface through the consumer's active Hypit Distribution. The packaged
`@example/example-component/preview` Source exists so this boundary can be checked without copying a
Source out of the package.
