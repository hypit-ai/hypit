# `@hypit/audiovisual-blender-local`

Local range Picture Source Terminal for project-owned frame-independent Blender Python scenes.

The package keeps Blender's scene vocabulary opaque to AVIR. One programme names portable Artifact-backed files and
an entry script that constructs the active `bpy` Scene. Its public Source still contains only finite Picture time and
space. The first implementation deliberately accepts only programmes declaring frame-independent evaluation and
therefore binds `range` access. Physics, fluid, cloth and other history-dependent scenes are not silently treated as
random-access; they require a later sequential or baked implementation contract.

For one request, Blender runs headless and renders the continuous bounding range needed by exact Source-local
observations into transparent PNG frames. FFmpeg packages those frames as a request-owned lossless alpha WebM and the
Terminal publishes `PreparedPictureSampling`. That value is a transient `DerivedRenderProduct`, not a Media Asset or
an NLE reference.

The runner sets Blender's frame number directly for each requested sample. An entry programme may therefore use
keyframes, drivers and other state that Blender can evaluate from an exact frame, but it must not rely on having
simulated all preceding frames. The package invokes Blender with a non-zero Python exit code so scene failures remain
the owning Terminal's error instead of surfacing later as a misleading missing-frame encode error.

The selected Blender and FFmpeg frame rate is an exact rational grid, including rates such as `30000/1001`; it is
not reconstructed by treating every exact-time denominator as an integer fps.

`createLocalBlenderNlePictureTerminalFacet({ terminal, blenderPath? })` lets the component package contribute the
exact local executor beside its NLE Source projection. Blender installation remains explicit environment setup;
ordinary execution never downloads it.
