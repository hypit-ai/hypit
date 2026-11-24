# `@hypit/html-electron-local`

Electron implementations of `HtmlCaptureBackend`. Both offscreen workers evaluate the same `HtmlProgram` and enable
HTML-in-Canvas for Picture Alpha compositing. The encoded-stream worker sends GPU textures to a WebCodecs H.264
encoder and uses FFmpeg to close the encoded stream as MP4. The frame-buffer worker captures PNG frames.
The caller explicitly supplies the Electron executable.
