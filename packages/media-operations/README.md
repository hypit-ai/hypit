# `@hypit/media-operations`

Provider-neutral requests for physical media extraction and materialization. This package owns
capabilities and request values; it does not own author syntax, NLE placement, a Timeline, or a
second media model.

Resource inspection, default stream selection and `PreparedMedia` construction belong to
`@hypit/media`:

```text
Blob -> inspect-media Need -> MediaInspection
     -> MediaStreamSelection
     -> PreparedMedia + exact LocalTemporalDomain + TemporalExtent
```

`extract-media-audio` and `extract-media-frame` are explicit Blob operations. Their requests retain
the selected stream index and extraction point, but make no Script, speech, placement or visual-role
claim. They can therefore be used as ordinary inputs to another package or Provider.

`render-still-video` materializes one or more pictures as a video Blob. Planning receives a literal
`TemporalDuration` and an explicit `TemporalSamplingGrid`; it accepts only a positive whole number of
frames and never rounds. `plan-still-video` distributes those frames by weight,
`bind-still-video-source` attaches the pictures in authored order, and the terminal Need asks a
Provider to encode the request.

The sampling grid is request policy, not a global Clock and not an NLE Timeline. A future author
frontend may construct these typed inputs, but this package deliberately publishes no XML/Markup
declarations.

This package also deliberately has no `PreparedMedia -> PreparedMedia` transform. Trim, slip, speed,
reverse, hold and transition relations belong to occurrences in `AudiovisualProgram`. Reusable
physical preprocessing happens as an explicit operation whose result re-enters through the ordinary
Blob/Media boundary.

Audio Programme execution belongs to `@hypit/audio-program`; final compatibility checks and mux
assembly belong to `@hypit/media-delivery`. One physical Provider may implement all of these
capabilities without merging their public ownership.
