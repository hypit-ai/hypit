# `@hypit/provider-html-electron-local`

This Runtime Adapter contributes the local Electron shared-texture HTML Endpoint. It produces encoded
visual output only and requires an explicit user-managed `electronPath` in the Runtime Profile.

Electron is a separate Endpoint package rather than a `renderer` mode of
`@hypit/provider-html-local`. A Profile selects one or both packages explicitly; execution never
falls back between them. The portable Chromium Endpoint remains in `@hypit/provider-html-local` and
also supplies PNG-frame capture.

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
