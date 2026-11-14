# `@hypit/facet`

The minimal opaque `Facet` envelope: an unversioned kind, optional logical address and inert
implementation. Package loading can carry it without learning what it does; only the owner of that
kind may interpret it. npm semver and the project lockfile select the installed implementation; Facets
do not add a second version system. Source and asset sessions live separately in
`@hypit/generation-authoring/workspace`.
