# `@hypit/provider-media-local`

Runtime and Endpoint adapter for the direct FFmpeg/FFprobe implementation in
`@hypit/media-local`.

This package owns Provider identity, capability support responses, Runtime Profile activation,
capacity and external-tool diagnostics. It does not own media algorithms or file authoring tools.
Direct NLE export and media import use `@hypit/media-local` without loading this package.

```ts
import { createLocalMediaProvider } from "@hypit/provider-media-local";

const media = createLocalMediaProvider({
  instance: "media.local",
  defaultConcurrency: 1,
});
```

The declarative Runtime form is:

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {},
  "endpoints": {
    "media.local": { "use": "@hypit/provider-media-local" }
  },
  "bindings": {}
}
```

The adapter declares the selected `ffmpeg`/`ffprobe` pair as an external, non-daemon Program.
Its probe checks that the selected executables start; it does not install them or guarantee every
codec and filter. Custom paths remain valid and unsupported operations report the underlying tool
error.

Inspection, audio extraction and frame extraction are transient authoring capabilities.
Speech-evidence projection, timeline-audio rendering and terminal muxing remain Build capabilities.
These choices belong to the Provider adapter and do not alter the direct media engine.
