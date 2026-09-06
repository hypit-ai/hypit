# `hypit/author-kit`

Small public framework API for an Author Package.

It joins four stable authoring boundaries: nominal Module declarations, deterministic component
handlers, sealed Graph Fragments and Markup Surface handlers. Domain facts still come from their
owners—for example `@hypit/composition`, `@hypit/semantic-track` and `@hypit/spatial`. This package
does not re-export the video vocabulary or turn those packages into one central object.

`hypit/author-kit` contains no registry, package search, installer, Runtime, Provider or Studio
selection. Importing it makes no component visible. A project's Source explicitly selects an
installed Author Package; the Host then consumes only the contribution exported by that package's
declared activation entry.

An external Author Package normally has one development dependency on the released `hypit`
Distribution. It imports this boundary from `hypit/author-kit` and the relevant domain owners from
subpaths such as `hypit/composition`, compiles its activation to JavaScript, and publishes only its
own built files and assets. At execution time the active Hypit Distribution supplies those exact
public subpaths. This keeps one framework implementation in the process and prevents a component
tarball from carrying private copies of Core.

The minimal independent fixture is
[`examples/minimal-author-package/packages/example-component`](../../examples/minimal-author-package/packages/example-component).
It can remain a project workspace package, or its owner can publish the same package name and install
that release in another project through npm or a private registry. Neither path changes the logical
Module import written by the Source.
