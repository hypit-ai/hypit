# `@hypit/audiovisual-media`

Media-owned adapters that publish already resolved source facts to AVIR without moving media policy into NLE.

The adapter publishes `picture` and `audio` output facets only when the selected media members exist.
Both facets retain the real prepared local domain; Picture additionally publishes its display-pixel
spatial domain. The adapter does not inspect a Resource, choose streams, transform time, create another
PreparedMedia value or lower into a Renderer.

```text
PreparedMedia -> ProgramSource
                   ├─ picture : Picture + temporal domain + spatial domain
                   └─ audio   : Audio + temporal domain
```

Film/NLE occurrences own every trim, slip, retime, loop, hold and curve applied to these outputs.
Terminal packages later combine the occurrence relation with the PreparedMedia member presentation map.

A still picture takes the direct branch instead of pretending to be PreparedMedia:

```text
explicit StillPictureSourceSpec + image Blob + PictureInterpretation
  -> StillPictureSource
     ├─ -> constant Picture ProgramSource
     └─ -> terminal-specific source implementation
```

`StillPictureSource` owns an explicit Source id and local spatial domain. Neither identity is recovered from
the Blob resource, URL, file name or byte hash. Its AVIR projection has no temporal domain: the finite duration
belongs to each Occurrence that uses the constant Picture. The Blob and colour interpretation remain outside
AVIR and travel only to terminal packages that need them.
