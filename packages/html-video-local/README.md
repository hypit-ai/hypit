# `@hypit/html-video-local`

Operating-system implementation of `HtmlVideoExecutor` for already lowered `HtmlVideoDeliveryPlan` values. It owns
request-local temporary resources, the explicitly selected HTML backend, AudioProgram execution and muxing. Action
handles and Project paths belong to the calling delivery Service.

Application distributions may construct one operating-system Executor and inject it into several delivery Services so
they share tool selection, readiness checks and a bounded cache of exact frame indexes for unchanged videos.
FFmpeg and browser processes are invocation-local children owned by that Executor.
