# `@hypit/hypit/author-kit`

Small public framework API for an Author Package.

It joins four stable authoring boundaries: nominal Module declarations, deterministic component
handlers, sealed Graph Fragments and Markup Surface handlers. Domain facts still come from their
owners—for example `@hypit/composition`, `@hypit/semantic-track` and `@hypit/spatial`. This package
does not re-export the video vocabulary or turn those packages into one central object.

`@hypit/hypit/author-kit` contains no registry, package search, installer, Runtime, Provider or Studio
selection. Importing it makes no component visible. A project's Source explicitly selects an
installed Author Package; the Host then consumes only the contribution exported by that package's
declared activation entry.

An external Author Package normally has one development dependency on the released `@hypit/hypit`
Distribution. It imports this boundary from `@hypit/hypit/author-kit` and the relevant domain owners from
subpaths such as `@hypit/hypit/composition`, compiles its activation to JavaScript, and publishes only its
own built files and assets. At execution time the active Hypit Distribution supplies those exact
public subpaths. This keeps one framework implementation in the process and prevents a component
tarball from carrying private copies of Core.

The Distribution includes the small package example at
[`examples/minimal-author-package/packages/example-component`](../../examples/minimal-author-package/packages/example-component).
Copy it into the video's `packages/`, give it the owner's package and Module name, and follow its
README to select the installed Hypit release as its development dependency. It includes the Manifest,
Surface, Fragment, Producer, activation, preview and TypeScript build configuration. It can stay in
the project or be packed and installed in another project without changing its logical Module import.

For a component that follows speech, [Ranking](../ranking/README.md) traces the complete semantic
path from a Selection or Moment through projection, schedule and drawing to a Studio Companion.
Its implementation illustrates those relationships; a new component owns its own visual behavior.
