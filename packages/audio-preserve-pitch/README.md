# `@hypit/audio-preserve-pitch`

`@hypit/audio-preserve-pitch` owns the Preserve Pitch audio reconstruction policy. `preservePitch()` returns a typed
`SignalReconstruction`, and the package publishes the same value through an ordinary Producer. It has no
AudioTrack, Clip or textual-author declaration dependency.

An AVIR author binding attaches this value to one selected signal read. That selection's exact Mapping remains
the sole target-to-source position fact; Preserve Pitch contains no rate, duration or inferred source range.
The reconstruction can therefore be a static binding or a future typed Operation result without changing the
Programme shape.

Omitting reconstruction keeps ordinary point sampling. A terminal may support only a defined subset of Mapping
relations. The local audio Provider currently supports a direct media child Programme used through a complete
positive-affine, non-looping Mapping; it rejects other programme shapes or reconstruction formats instead of
silently resampling them.
