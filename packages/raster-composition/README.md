# `@hypit/raster-composition`

Ordered physical composition of raster Blobs. Each layer carries a target-to-source `SpatialMap`;
array order is paint order. The package accumulates dynamically produced source Blobs through pure
Producers and emits a Need only when the completed composition is rendered.

There is no `Canvas`, `Frame` or `fit` vocabulary here. An author/compiler resolves those higher-level
choices into the shared spatial algebra before reaching this boundary. The package contains no Author
syntax, graph Fragment, Provider or NLE track concept.
