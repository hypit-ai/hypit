# @hypit/html-video

`@hypit/html-video` assembles an already lowered `HtmlProgram`, an `AudioProgram` and one explicit
`MediaDeliverySpec` into a final video request. Its direct delivery plan:

1. projects the delivery requirement into a visual requirement;
2. requests rasterization of the supplied `HtmlProgram`;
3. requests rendering of the supplied `AudioProgram`;
4. muxes the two typed products under the same delivery requirement; and
5. exports the resulting video Blob.

`createHtmlVideoDeliveryPlan` validates one
`HtmlProgram`, one `AudioProgram` and one explicit delivery policy, producing the exact visual and audio requests.
`executeHtmlVideoDeliveryPlan` runs those two independent requests in parallel through an injected executor, creates
the validated mux request only after both products exist, and verifies the returned `MuxedMedia`. The caller owns
the execution implementations and resource storage; the plan contains no Chromium, FFmpeg, file-path, Endpoint or
Runtime state. A Build host may bind the same requests through Providers, while a local NLE host may call direct
rendering engines.

The optional Source/Author Graph fragment lives in `@hypit/html-video-author`; importing this NLE terminal does
not install Author Graph or Temporal Graph.

`lowerNleProjectToHtmlVideoDeliveryPlan` is the downstream NLE adapter. It structurally lowers one `NleProject`
once, derives both terminal programmes from that same AVIR value, and supplies an exact silent `AudioProgram` when a
picture-only project is exported. NLE Core therefore remains unaware of terminal Source implementations, delivery
policy and provider execution. The caller supplies one invocation-local `NleHtmlOutputSelection`: its sampling grid
samples exact NLE programme time independently of the editing/snap rate, while its Canvas and Picture transform map
the output viewport into Programme Space independently of authored Item coordinates. `createNleScaledHtmlOutput()`
constructs the ordinary same-aspect 720p/1080p/4K case and rejects an aspect change; callers choosing contain, cover,
stretch or another reframe policy provide the exact transform explicitly.

The adapter's link session is transient. The `hypit.nle-package@1` facet supplies only `ProgramSource` contracts and
AVIR Operators. A package that supports this HTML-plus-Audio delivery path may independently publish
`hypit.html-video-nle-package@1`, which binds one selected Component output to an HTML Source value or a sampling-time
Audio Source factory. Prepared Media and nested NLE projects are bound by this package itself. The session observes
the single recursive NLE→AVIR pass, retains no named dependency after export, and is never serialized into the NLE
Project or AVIR.

The same terminal facet may expose package-owned `NleHtmlVideoResource` values. Each resource pairs one typed
`BlobRef` identity with an invocation-time `open()` function; the application Host retains those bytes and binds the
Artifact when it materializes or executes the Programme. Package files, HTTP URLs and cache locations therefore do
not enter NLE or AVIR, and large images or fonts do not need to be embedded as data URLs.

An optional selected-range form accepts an absolute visual `FrameSpan` and an audio render range.
Those are request-time selections, not a Timeline author model.

The delivery plan does not interpret Composition or Track values, does not own browser execution, and does
not select a Provider. The optional NLE adapter delegates structural project lowering to `@hypit/nle`; terminal
Picture/Audio compilation belongs to `@hypit/audiovisual-html` and `@hypit/audiovisual-audio`; concrete
rasterization, audio processing and muxing belong to the caller's selected execution implementations.
