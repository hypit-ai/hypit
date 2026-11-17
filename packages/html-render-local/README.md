# `@hypit/html-render-local`

Renderer-neutral local staging and supervision shared by Chromium and Electron `HtmlProgram` implementations. It
selects observable Artifacts, owns request-local directories and HTTP serving, supervises capture workers and joins
independently completed frames into one bounded ordered encoder stream. For timed Picture inputs it indexes the closed
selected stream, resolves exact sided observations to decoded frame ordinals, prepares Picture-interpreted PNGs under
bounded byte capacity and serves them into compiler-owned display slots. Chromium and Electron therefore consume the
same source pixels. It defines the capture backend contract but does not select either browser.

Source preparation indexes exact selected-stream timestamps first. It keeps ordinal sampling exact, avoids timestamp
seeking, and opens at most a 16-frame sequential decode window beginning at the first missing ordinal. Required frames
hold leases through HTTP delivery; nearby frames are soft prefetch and remain in a byte-bounded LRU working set. Probe,
decode demand and resident pixels are shared by HTML Sources that select the same resource, stream and Picture
interpretation.

Automatic Chromium capture starts below its host-derived browser ceiling. Workers claim roughly one-second batches;
after stable batches the render compares measured production throughput and adds or retires workers only at a batch
boundary. Explicit numeric `workers` remains a fixed count, and short renders do not open browsers they cannot amortize.

Disposable browser workers own an invocation-local operating-system process tree. Cleanup terminates and confirms that
tree while its root PID is still owned by the worker; killing only the browser parent is insufficient because browser
helpers may retain inherited pipes and keep the caller alive after capture has completed.
