# `@hypit/provider-html-electron-local`

This Runtime Adapter contributes the local Electron shared-texture HTML Endpoint. It produces encoded
visual output only and requires an explicit user-managed `electronPath` in the Runtime Profile.

Electron is a separate Endpoint package rather than a `renderer` mode of
`@hypit/provider-html-local`. A Profile selects one or both packages explicitly; execution never
falls back between them. The portable Chromium Endpoint remains in `@hypit/provider-html-local` and
also supplies PNG-frame capture.

This package owns the Electron executable probe, Runtime Adapter, Endpoint, Program, shared-texture
capture backend, child worker, browser-side decoder/encoder runtime and pinned Mediabunny source.
`@hypit/html-render-local` contributes the renderer-neutral staging, request limits, progress and
worker supervision used by both local Providers. Electron does not depend on the Chromium Provider,
Puppeteer or browser installation machinery.

The Endpoint accepts the same typed `HtmlProgram` and visual-delivery subset as the Chromium visual
Endpoint. It decodes exact compiler-selected source samples in the browser, transfers composed frames
as offscreen shared textures, encodes H.264 with WebCodecs and uses FFmpeg only for container muxing
and verification. It does not offer PNG-frame capture.

```json
{
  "endpoints": {
    "html.gpu": {
      "use": "@hypit/provider-html-electron-local",
      "pool": "local-gpu",
      "config": {
        "electronPath": "/Applications/Electron.app/Contents/MacOS/Electron"
      }
    }
  }
}
```

Electron is never downloaded or inferred. Version 45 or newer is required for the shared-texture API.
The Profile may configure Chromium and Electron Endpoint instances side by side; each remains a fixed
port with its own executable and capabilities.
