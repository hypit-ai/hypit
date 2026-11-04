# `@hypit/spatial`

Pure two-dimensional video geometry. The package owns the final raster viewport, resolved
picture-plane geometry, source extents and affine/projective mappings. It owns no layer tree, media, Paint,
motion, Timeline, detector, Provider or renderer policy.

The package now exposes two deliberately different boundaries. `@hypit/spatial/algebra` is the
renderer-free relationship algebra used by AVIR. The package root retains the existing author and
resolved pixel-geometry surface. Neither boundary is Hypit Core.

## Clock- and Canvas-free spatial algebra

`@hypit/spatial/algebra` owns `LocalSpatialDomain`, finite `SpatialRegion` and an invertible affine or projective
`SpatialMap`. A Map has an explicit sampling direction:

```text
target / parent position -> source / child position | outside
```

It can therefore answer the renderer's actual question without deriving an inverse from CSS, DOM
hierarchy or nearby Frames. `evaluateSpatialMap()` returns no sample when either the target position
or its mapped source position lies outside the corresponding finite Domain. `composeSpatialMaps()`,
`invertSpatialMap()` and `identitySpatialMap()` preserve the named Domain boundaries.

Coordinates in this algebra are unit-neutral. A component may use pixels, normalized layout units,
an SVG viewBox or another local convention, provided its public Mapping states the relationship.
Affine transforms use six coefficients. Projective transforms use an explicit invertible homogeneous 3×3
relation; a map whose horizon crosses its finite target Domain is rejected. `composeSpatialMaps()`,
`invertSpatialMap()` and `evaluateSpatialMap()` work on both kinds. Arbitrary warp, camera and 3D rasterization
remain package-owned Mapping programmes or typed Picture Operators instead of becoming central flags.

The existing root `SpatialMap2D` has a different, author-facing direction: it places local geometry
into the program picture plane. A compiler may invert that placement into the canonical sampling
Map, but the two meanings are not aliases and are not accepted interchangeably.

`interpolateSpatialMaps()` is one deliberately named value policy: linear interpolation of the six
affine coefficients while preserving target and source Domains. It is used by the first resolved AVIR
motion Control. It is not a universal motion rule—decomposed rotation, perspective, path motion and 3D
camera interpolation remain separate package-owned policies. A coefficient interpolation that becomes
singular is rejected at the sampled position rather than silently repaired.

## The spatial values

- `Canvas` is the final raster viewport. A `<space:Canvas>` publishes `.canvas` for raster consumers
  and `.bounds` for ordinary geometry consumers. Its runtime value contains only width and height;
  the `@1` coordinate convention is a protocol rule rather than four repeated constants.
- `SpatialPoint`, `SpatialFrame` and `SpatialPath` are plain resolved values in the program picture
  plane: top-left origin, x right, y down, square pixels. They carry no Canvas id, parent pointer or
  construction history.
- `IntrinsicExtent` is the natural width and height of a source or local picture plane.
- `ContentFit` is an authored mapping policy.
- `SpatialMap2D` is an affine map from a local plane into the program picture plane.

Canvas is deliberately not a container. Visual components own clipping, Paint, draw order and
motion. A Frame may extend outside the Canvas and may be reused anywhere its numbers mean the same
thing.

The package's Author declarations own the semantic shapes and lowering for Canvas, Point, Path,
Extent, Map and the three Frame constructors. Markup contributes only their tag spellings. Direct
Author declarations and Markup therefore use the same validation, reference Types and graph
fragments; declaration order does not determine reference availability.

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<space:Frame id="safe" within={vertical.bounds}
  left="6%" top="5%" right="94%" bottom="92%"/>
<space:AnchoredFrame id="portrait" within={safe}
  x="100%" y="100%" width="320px" height="320px" anchor="bottom-right"/>
```

`Frame`, `AnchoredFrame` and `AspectFrame` are three constructors for the same runtime
`SpatialFrame`. Other layout packages can publish that same Type without modifying this package.

An author or project component that already knows an affine relation can publish it directly:

```svml
<space:Map id="turned" xx="0" xy="-0.5" yx="0.5" yy="0" tx="920" ty="180"/>
```

This is the open value below fitting conveniences, not a scene node. It carries no source, Frame,
Canvas identity, clipping policy or time.

## Content fitting resolves a mapping

`resolveContentFit(frame, extent, fit)` returns a `SpatialMap2D`. It does not invent a second
`FittedContent` model. Consumers may apply the map to source-local Points and Paths, and may derive
the mapped source bounds when they need a rectangular optimization or diagnostic. That bounding
rectangle is not the mapping and cannot replace it after rotation, skew or reflection.

`ContentFit.sizing` selects the scale before alignment:

| Sizing | Result |
| --- | --- |
| `contain` | Preserve aspect and fit both dimensions inside the destination |
| `cover` | Preserve aspect and cover both destination dimensions |
| `fit-width` / `fit-height` | Preserve aspect and match the named dimension |
| `native` | Keep the source's pixel dimensions |
| `scale-down` | Use `contain` while limiting scale to at most 1 |
| `stretch` | Match destination width and height independently |

`framePoint` selects a normalized point in the destination and `contentPoint` selects the source
point placed there. `offsetPx` adds an explicit displacement. `bounded` constrains the translation
to the available placement range; `free` preserves the authored translation. Clipping is still the
visual consumer's decision.

The Recipe decoder exposes `fit`, `frame-x`, `frame-y`, `content-x`, `content-y`, `fit-offset-x`,
`fit-offset-y` and `fit-constraint`. Visual Track uses it, and project components may use the same
pure functions.

## Spatial sequences are a peer package

Frame-indexed regions do not belong to static geometry. `@hypit/spatial-sequence` imports an editable
`RegionSequenceDocument`, then attaches it exactly to one Timeline and final Canvas. Detection,
identity association and author correction happen before import. Consumers assign meaning to named
series explicitly. This keeps Spatial reusable and avoids a central scene, tracking or evidence registry.
