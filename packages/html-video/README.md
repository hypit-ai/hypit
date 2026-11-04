# @hypit/html-video

`@hypit/html-video` assembles an already compiled `HtmlProgram`, an `AudioProgram` and one explicit
`MediaDeliverySpec` into a final video request.

Its Fragment:

1. projects the delivery requirement into a visual requirement;
2. requests rasterization of the supplied `HtmlProgram`;
3. requests rendering of the supplied `AudioProgram`;
4. muxes the two typed products under the same delivery requirement; and
5. exports the resulting video Blob.

An optional selected-range form accepts an absolute visual `FrameSpan` and an audio render range.
Those are request-time selections, not a Timeline author model.

The package does not compile Composition or Track values, does not own browser execution, and does
not select a Provider. Visual compilation belongs upstream in `@hypit/audiovisual-html`; concrete
rasterization, audio processing and muxing belong to the selected Runtime capabilities.
