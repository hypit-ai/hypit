# `@hypit/audiovisual-audio`

One-way terminal lowering from the complete resolved `@hypit/audiovisual` Audio DAG into
`@hypit/audio-program`.

Unlike Picture lowering, Audio lowering never evaluates the Programme once per video frame. It preserves
the exact Programme temporal Domain and lowers the continuous `silence / use / restrict / mix / apply`
graph directly. The selected terminal sample rate is an Output policy and is not an authored Clock.

Source implementations are explicit typed `AudiovisualAudioSource` values. Each binds one nominal
`ProgramSource` output to a closed `AudioProgram` in that output's own Domain. A finite Source-set fold feeds
the terminal compile Producer; there is no callback, package scan or id-to-implementation registry. The adapter
alone applies the Occurrence's active range, parent placement and output Mapping by placing that child signal as
a nested Programme node. A reconstruction selected for that mapped read travels on the same nested Programme
use; it is not copied onto the child media leaf or inferred from the Mapping. A Source implementation therefore
cannot move its own use in the parent. Operator
packages publish their opaque programme payload together with the typed Operator contract;
the adapter transfers it directly into `AudioProgram` and performs no id lookup. It preserves arbitrary named
ports and never introduces Track, Clip lanes, a media-kind switch or a central Operator registry.

`prepared-media-source` is the first concrete Source implementation Producer. It returns a one-leaf signal in
the Prepared Media output Domain and owns no parent placement. `program-source` recursively closes a child
`AudiovisualProgram` with its own Source set and publishes the result as the child's terminal Source value.
The generic adapter then uses the authored
Occurrence relation, so trim, gaps, reverse, holds and variable speed remain ordinary mappings. The vertical
proof closes both Prepared Media and a child `AudiovisualProgram` through `ProgramSource`, a parent Programme
and the local audio terminal. The local renderer recursively reaches the real media leaf without introducing a
temporary file, a Compound category or a media-shaped identity for the child Programme.

For every `apply`, the adapter also closes each named temporal binding as one exact Programme-to-Control
`TemporalMap` and writes those Maps onto the terminal Process node. It neither samples Controls at video
frames nor interprets their values. The programme owner remains responsible for the Control value and
interpolation policy; the terminal only supplies continuous coordinates. The Operator's general temporal-support
contract is copied onto the same Process node, so a Provider can plan look-around, state/pre-roll, latency and
tail without recovering an effect name. The Audio Gain proof exercises an
Occurrence-local Control through AVIR lowering and real 48 kHz sample rendering.

The Preserve Pitch proof follows the other orthogonal path: `@hypit/audio-stretch` publishes a typed
`SignalReconstruction`, the author fold may receive it as a future Operation value, and lowering places its opaque
programme on the mapped nested Programme use. The local terminal currently executes the direct-media,
positive-affine subset and rejects other shapes at its capability boundary.

`createAudiovisualAudioFragment()` and `createAudiovisualProgramAudioSourceFragment()` make the finite folds
ordinary AuthorGraph operations. Output sample rate is a separate typed terminal input. If no Audio target
demands these outputs, Kernel pruning omits the Media and nested Programme terminal branches.

The package is downstream. `@hypit/audiovisual` does not import AudioProgram, PreparedMedia, Renderer or
Provider types.
