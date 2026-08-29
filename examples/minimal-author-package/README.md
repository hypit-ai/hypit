# Minimal author-package fixture

Use this directory only as the generic author-package fixture. It is deliberately not a complete video
project: the `packages/example-component` package is the authoritative small implementation, while
the package's `preview/` asset demonstrates a Surface preview.

The fixture's Surface decoder also demonstrates the public value boundary: Style-like values consume
a decoded recipe shaped as `{ path, properties }`, exact `FontStackRef` records and inline values
only after checking `record.value.kind === "inline"`. Media slots remain graph inputs rather than
package files.
