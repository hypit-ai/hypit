# `@hypit/audio-track`

Official provider-free Audio Track authoring package.

It consumes explicitly selected and normalized `SynchronizedMedia`, resolves Program, Selection or
Moment windows through `@hypit/temporal`, applies exact source trim and one-shot, loop or bounded
pitch-preserving stretch occupancy, and lowers independent items to one ordinary peer `AudioTrack`.

The public audio waist uses one exact 48 kHz sample mapping. It contains no Provider, queue, path,
Narrative identity, privileged speech lane, automatic extraction, loudness normalization or hidden
mixing behavior. Local and remote media Endpoints execute the same `AudioProgramPlan`.
