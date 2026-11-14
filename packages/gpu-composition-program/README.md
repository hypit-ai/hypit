# `@hypit/gpu-composition-program`

Execution-owned Picture composition programme for a native/WebGPU root compositor. It contains a
finite output frame grid, transient Picture inputs and ordered per-frame spatial sampling relations.
It is not AVIR, an author document, a Media Asset or a persisted interchange format.

The first executor compiles this programme into a WebGPU-only `HtmlProgram` so Dawn can run it in the
existing Chromium/Electron delivery path. The programme itself contains no DOM, CSS, WGSL, wgpu,
Dawn, filesystem or encoder values; another executor may consume the same value through native wgpu.
