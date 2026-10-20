# Minimal author-package fixture

The `packages/example-component` directory contains a small complete Author Package. Its `preview/`
asset demonstrates a Surface preview, and its Style Surface reads an SVS Recipe and exact FontStackRef.
The Distribution includes these sources. The package README explains copying it into a video project,
selecting a released Hypit development dependency, compiling it and sharing its tarball.

The fixture's Surface decoder also demonstrates the public value boundary: Style-like values consume
a decoded recipe shaped as `{ path, properties }`, exact `FontStackRef` records and graph values
only after checking `record.value.kind === "inline"`. Image slots remain graph inputs rather than
package files. Its visual Surfaces also receive an explicit `within` Frame; the example never relies
on a renderer root implicitly meaning the whole Canvas.

The package builds against the public Hypit language SDK and declares its video-domain libraries as
ordinary dependencies. `pnpm --dir packages/example-component pack` produces a JavaScript tarball;
its dependencies are installed by the package manager, not bundled. Installing it in another project
and importing `@example/example-component@1` loads
the same Module and Surface through the consumer's active Hypit Distribution. The packaged
`@example/example-component/preview` Source exists so this boundary can be checked without copying a
Source out of the package.
