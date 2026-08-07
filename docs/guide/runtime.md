---
title: Runtime & Providers
description: How components connect to external generation services such as Seedance.
---

# Runtime & Providers

Ordinary video authors should not need to initialize a Runtime or put API keys in project files.

## Author workflow

Sign in to a Provider once:

```bash
svml provider login seedance
```

Then import and use its component in a video:

```xml
<svml>
  <import as="seedance" from="@svml/seedance@1"/>

  <seedance:speaker
    script={story.segment.opening}
    character="./host.png"
    direction="Speak naturally to camera"
  />
</svml>
```

Build normally:

```bash
svml build main.svml
```

## Who calls the API

The `@svml/seedance` package carries its own Runtime implementation for queueing, requesting, polling, and downloading. The official CLI loads it automatically when it encounters the component. Keys remain in the system keychain or the user's global SVML configuration; they never enter `.svml` files, lockfiles, or Git.

::: info Not implemented yet
This is the planned author workflow, not a command set already provided by the current repository. The existing implementation accepts prepared local media and capability artifacts only.
:::

Only developers embedding SVML inside another product need to work directly with APIs such as `createRuntime()`.
