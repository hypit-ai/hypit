# `@hypit/spatial`

Clock-, Canvas- and renderer-free spatial relationship algebra.

The package has one public model. Its root and `@hypit/spatial/algebra` entry expose the same
`LocalSpatialDomain`, finite `SpatialRegion` and invertible affine/projective `SpatialMap` facts.
The former Canvas, SpatialFrame, SpatialMap2D, content-fit declarations, Producers and author
fragments were a second geometry system and have been removed rather than retained as compatibility.

A canonical Map samples in one explicit direction:

```text
target / parent position -> source / child position | outside
```

`evaluateSpatialMap()` therefore answers the renderer's actual sampling question without deriving
meaning from DOM hierarchy or nearby layout objects. `composeSpatialMaps()`, `invertSpatialMap()`
and `identitySpatialMap()` preserve named Domain boundaries. Affine maps use six coefficients;
projective maps use an invertible homogeneous 3×3 relation and reject a horizon crossing the finite
target Domain.

Coordinates are unit-neutral. A component may use pixels, normalized units, an SVG viewBox or another
local convention as long as its public Mapping states the relationship. Contain/cover, anchoring,
layout frames, clipping, motion paths, tracking, cameras, warp and 3D are policies owned by the author
component or a dedicated package; they are not alternate root types in this algebra.

`interpolateSpatialMaps()` is one explicit value policy for affine coefficient interpolation while
preserving source and target Domains. It supports the current spatial Control implementation but is
not a universal motion rule. Other interpolation or execution programmes remain package-owned.
