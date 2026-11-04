# `@hypit/audio-gain`

Audio Gain owns the package-defined gain execution programme used by the audiovisual Audio DAG.
`audio-gain-operator` accepts an `AudioGainOperatorSpec` and publishes a typed `AudioOperator` with the
named `signal` port. The exact `hypit.audio-gain@1` programme and gain parameter travel on that value, so
`@hypit/audiovisual` and its terminal adapter do not maintain a gain enum or recover parameters by id.

`audio-gain-control-operator` is the time-varying form. Its package-owned `AudioGainControl` is a total
piecewise-linear gain signal on one explicit local temporal Domain. The Operator advertises that Domain
under the named `gain` Control port; an AVIR `apply` supplies a Programme-, Occurrence-, Source- or
explicit-Map binding. Audio lowering preserves the resulting Programme-to-Control Map and the local
renderer evaluates it at audio sample positions. Fade in, fade out and gain envelopes are therefore
ordinary uses of this Operator, not concepts added to Occurrence, Track, Clip, AVIR or Temporal Core.

Additive mixing itself is the closed Audio algebra's ordinary `mix` node. It therefore needs no package
declaration, `AudioTrack`, Timeline, Mixer lane or intermediate set. Dry/wet branches, parallel copies and
sidechain routing are expressed by signal graph edges and package-owned named Operator ports.
