# `@hypit/html-electron-local`

Electron shared-texture implementation of `HtmlCaptureBackend`. One offscreen Electron scene evaluates the same
`HtmlProgram` used by Chromium, transfers committed GPU textures to a WebCodecs H.264 encoder, and uses FFmpeg only
to close the encoded stream as MP4. The caller explicitly supplies the Electron executable.
