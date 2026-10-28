# Example component fixture

A small complete package for learning Manifest, Declaration, Fragment, Producer and activation wiring. Framework-facing imports come from
the narrow `@hypit/hypit/author`, `producer`, `refinement` and `markup` subpaths; video-domain imports
use their owning packages, such as `@hypit/composition` and `@hypit/temporal`. Declare these libraries
as ordinary dependencies and the language Host as a compatible peer. TypeScript and Node types are
build tooling. Dependencies are installed by the package manager, not bundled into the tarball.

It contains a Module Manifest with nominal Types, deterministic Producers and refinements, Markup
declarations that describe the Source syntax, Author declaration compilers that emit records and
components, and sealed Fragments with literal `fragment-input`, `fragment-operation` and `output`
references. Declaration fields resolve exact public Types before they are connected to graph inputs.

The declarations demonstrate a box, a text component, an image slot and a Style value. The slot is a graph
input; it is not a file bundled by the package. `preview/Box.png` is reusable preview material included
in the package. `exampleAppendFragment` and `append-example-items` show a fixed-port
append that can be chained once per child.

`ImageSlot` deliberately accepts only an image Blob. A raw video Blob does not carry the frame
domain or target-to-source sampling relation required by a Visual video element; a component that
needs timed footage should consume `PreparedMedia` or another typed compositable value and author that relation
explicitly. The fixture stays small by not pretending those facts can be inferred from a MIME type.

While the component belongs to one project, keep this directory under that project's `packages/`
and use its owner-scoped package name. If the owner chooses to share it, compile and publish the same
package through npm or a private registry. Consumers install a chosen release with their ordinary
package manager and commit the resulting lockfile. The Source's logical Module import remains the
same whether the package is linked from the project workspace or installed from a registry.

## Use the included source outside the Hypit repository

Copy this directory into the video project's `packages/` and give the package and Module the owner's
name. The fixture's `workspace:` ranges connect it to the repository during Hypit development. In the
copied package, replace them with the selected installed releases before using npm. For example:

```bash
npm install --save-dev @hypit/hypit@<selected-release>
npm install @hypit/composition@<version> @hypit/media@<version> @hypit/spatial@<version> @hypit/temporal@<version> @hypit/timeline@<version>
npm run build
npm pack
```

If the selected Distribution was supplied as a tarball, use its path in the install command instead.
Installing it as a development dependency supplies public types; the consumer's active Hypit
Distribution supplies the runtime APIs. The resulting component tarball contains its own built code
and preview assets. For registry publication, select a release version and remove the fixture's
`private: true` after the owner chooses to publish it.

The repository's Ranking package is a richer example of resolved temporal inputs, persistent visual
state and a Companion; it is an independently shared component, not a required default dependency.
