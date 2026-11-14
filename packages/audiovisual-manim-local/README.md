# `@hypit/audiovisual-manim-local`

Local sequential Picture Source Terminal for project-owned Manim Community scenes.

The package binds one nominal AVIR `ProgramSource` output to an opaque
`hypit.manim-scene@1` programme. A programme names its Scene class, portable
entry path and explicit Artifact-backed files. It does not contain NLE
placement, an output canvas, a Provider, a project path or a Media Asset.

Execution accepts a complete finite Source (`whole`) or a continuous prefix
planned as `sequential` from Source-local zero. The package-owned runner limits
ordinary Cairo `play`/`wait` output at the exact requested frame boundary and
ends construction through Manim's normal early-completion lifecycle. It does
not render the complete Scene and then trim its video. The final Picture Output supplies exact observations; ordinary
`TemporalMap` relations project them into Source-local sample points. The
Terminal chooses the coarsest bounded rational zero-origin frame grid containing
the exact requested Source-local observations. It rejects a request
above the Host-selected ceiling instead of silently relying on adjacent video
frames.

One render produces a request-owned transparent WebM and publishes it as the
shared Media `PreparedPictureSampling`: a decodable Picture source plus the
identity Map from the nominal Source domain into that stream. The value is a
`DerivedRenderProduct`, not `PreparedMedia`, a Media Asset or an NLE reference.
The downstream HTML compositor consumes the same relation without knowing
Manim. NLE local export and Workbench preview now execute this Terminal before
ordinary HTML lowering, so a Manim Component occurrence reaches the same final
Chromium visual render as Media and native HTML Components.

The NLE application has no Manim branch. The component package that selects a
terminal identity also contributes
`createLocalManimNlePictureTerminalFacet({ terminal: "the.same.identity" })`
from its ordinary package activation. That facet implements the Host-owned
`hypit.nle-local-picture-terminal` ABI from `@hypit/nle-audiovisual-local` and closes only the Sources explicitly
assigned to that identity. The factory validates the opaque programme as
`hypit.manim-scene@1`; neither `nle-local` nor AVIR infers an executor from that
format.

`createManimTerminalCapability()` exposes the matching invocation-local offer:
Manim accepts only selected Picture Source tasks with whole or zero-origin
sequential access, consumes no upstream Product, and publishes only its
explicitly configured Picture representation. The Host still decides whether
any demanded Source is bound to this Terminal.

The selected prefix may contain more samples than one sparse observation set,
but remains transient implementation output. The resulting sampling Map covers
only the executed Source prefix, while the cross-island requirement still
exposes the original demanded regions. Non-zero-origin range execution and
resume/checkpoint semantics are not claimed.

The Python environment pins Manim Community independently under `runtime/`.
Provisioning is explicit through `prepareManimRuntime()`; rendering never runs
an installer. `requireManimRuntime()` returns the selected locked Python
environment for `ManimExecutionEnvironment.pythonPath`. Cairo/Pango and FFmpeg
remain local deployment requirements.
