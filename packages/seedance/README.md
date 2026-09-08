# `@hypit/seedance`

Exact Seedance author model module. It owns the request schema and exactly three invocation Surfaces;
it does not contain KIE credentials, HTTP code, queues, runtime routing or usage-specific Prompt assembly.

The three model invocation shapes are deliberately separate:

- `TextVideo`: Prompt only; this is the only shape that exposes Web Search.
- `FrameVideo`: required first frame and optional last frame.
- `ReferenceVideo`: one or more image, video or audio references within the model's port limits.

All three preserve the remote result as one atomic `GeneratedVideoSet`, then expose its first ordered
member as an ordinary `BlobArtifact`. Their prompt ports consume ordinary `Text`, so a Script projection,
generic Text Template or third-party author module can feed them without becoming part of Seedance.

`standard`, `fast`, `mini` and `2.5` select model variants independently of the invocation shape. Duration is
the author's literal, in whole seconds inside the model's declared range; measure the spoken line first
with `hypit measure` and write the number here. Nothing in the graph computes it, so a Build plan is
complete before it starts.
