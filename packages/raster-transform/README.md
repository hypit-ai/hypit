# `@hypit/raster-transform`

Deterministic transformations of one raster Blob. The package owns the ordered transform Program,
one Producer that turns an upstream Blob and Program into a Need, and the `transform-raster`
Capability. It contains no Author syntax, graph Fragment, Provider or filesystem policy.

Crop, resize and photometric operations describe physical preprocessing of a raster. They are not
NLE picture placement or time-varying picture filters.
