# `@hypit/audiovisual-media`

Optional Author Graph bridge around the pure `@hypit/media-avir` projection.

```text
PreparedMedia -> ProgramSource
                   ├─ picture : constant | signal + spatial domain
                   └─ audio   : signal + temporal domain
```

The adapter publishes only members that exist. A signal Picture and Audio retain the real prepared
local temporal domain; a constant Picture has no temporal domain. Picture always publishes its
display-pixel spatial domain.

Image, video and audio preparation all belong to `@hypit/media`. The projection implementation belongs to
`@hypit/media-avir`; this package owns only its Producer, Fragment and Source declaration. There is no separate
`StillPictureSource`, image identity recovery, Resource inspection or stream-selection path here.
This adapter also owns no trim, retime, occurrence placement or renderer lowering. Those relationships
remain respectively in the audiovisual Programme and terminal packages.
The package-owned `Source` author declaration accepts one typed `PreparedMedia` reference and exports one
`ProgramSource`. This is the normal bridge from Media selection into audiovisual composition; it does not
copy media metadata into SVML and it does not infer a generated asset's actual extent from request fields.
