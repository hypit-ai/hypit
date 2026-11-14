# `@hypit/gpu-composition-webgpu-html`

WebGPU-in-HTML executor adapter for `GpuCompositionProgram`. It creates a GPU-only composition page and
returns an ordinary `HtmlProgram` solely so the existing artifact staging, deterministic frame seeking,
shared-texture capture and encoding providers can execute it. Picture placement and layer composition are
performed by WebGPU, not DOM/CSS.

The Chromium frame-buffer adapter renders into an offscreen GPU texture and explicitly reads the completed
RGBA frame into its capture canvas. This matches that provider's existing PNG/FFmpeg boundary and avoids relying
on a headless browser swapchain. A future shared-texture or native wgpu provider can keep the same programme GPU
resident without changing AVIR or this programme model.

This is the first executable GPU compositor slice, not a claim that browsers are the permanent native
host. A later wgpu process can consume the same `GpuCompositionProgram` without changing AVIR.
