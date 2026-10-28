# `@hypit/region-evidence`

Frame-exact external spatial evidence. The package relates prepared region observations to one
Timeline and resolves normalized boxes inside an explicit program-picture Frame. It performs no
detection, identity inference, interpolation or source-to-picture placement discovery.

The package owns the declaration shape and graph lowering below. Markup contributes only the
`Evidence` spelling; other author frontends can provide the same declaration directly.

```svml
<import as="region" from="@hypit/region-evidence@1"/>
<region:Evidence id="heads" within={vertical.bounds} timeline={program.timeline}
  recipe={tracking.heads.default}/>
```

```svs
heads.default {
  series: [
    {"id":"GUEST","regions":[[0.12,0.09,0.20,0.26],null]}
  ];
}
```

Each series has exactly one normalized `[x, y, width, height]` box or `null` per Timeline Frame.
The resulting `RegionEvidence` contains resolved `SpatialFrame` values in the program picture plane.
The chosen Frame may be the Canvas bounds, an inset or any other explicit region.

Source-local observations must be projected through the actual visual presentation before they are
written as final evidence. That adapter may use the same `SpatialMap2D` used to fit the source; it
belongs with the presentation/evidence workflow rather than in `@hypit/spatial`.
