# `@hypit/audiovisual-gpu-composition`

Root Picture Terminal which closes an AVIR composition island as a `GpuCompositionProgram`.
Foreign Sources and Operators remain in their selected terminals and arrive as transient
`PreparedPictureSampling` products. This terminal currently owns only transparent/use/restrict,
spatial remap and ordered-over composition; crop and package Operators stay in another island.

The package is a real second AVIR root lowering. It owns no GPU API or encoder; WebGPU/Dawn and future
native wgpu executors consume the resulting programme independently.
