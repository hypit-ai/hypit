# @hypit/html-video

`@hypit/html-video` assembles an already compiled `HtmlProgram`, an `AudioProgram` and one explicit
`MediaDeliverySpec` into a final video request.

Its Fragment:

1. projects the delivery requirement into a visual requirement;
2. requests rasterization of the supplied `HtmlProgram`;
3. requests rendering of the supplied `AudioProgram`;
4. muxes the two typed products under the same delivery requirement; and
5. exports the resulting video Blob.

The same assembly is also available without an Author/Build Graph. `createHtmlVideoDeliveryPlan` validates one
`HtmlProgram`, one `AudioProgram` and one explicit delivery policy, producing the exact visual and audio requests.
`executeHtmlVideoDeliveryPlan` runs those two independent requests in parallel through an injected executor, creates
the validated mux request only after both products exist, and verifies the returned `MuxedMedia`. The executor owns
Provider/Endpoint selection and resource storage; the plan contains no Chromium, FFmpeg, file-path or Runtime state.

`lowerNleProjectToHtmlVideoDeliveryPlan` is the downstream NLE adapter. It evaluates one `NleProject` once, derives
both terminal programmes from that same AVIR value, and supplies an exact silent `AudioProgram` when a picture-only
project is exported. NLE Core therefore remains unaware of delivery policy and provider execution.

An optional selected-range form accepts an absolute visual `FrameSpan` and an audio render range.
Those are request-time selections, not a Timeline author model.

The delivery plan does not interpret Composition or Track values, does not own browser execution, and does
not select a Provider. The optional NLE adapter delegates project evaluation to `@hypit/nle`; visual compilation
belongs upstream in `@hypit/audiovisual-html`; concrete
rasterization, audio processing and muxing belong to the selected Runtime capabilities.
