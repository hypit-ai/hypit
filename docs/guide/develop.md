---
title: Development Guide
description: Getting started with Hypit development.
---

## Prerequisites

| Tool | Version | Required for |
|---|---|---|
| Node.js | 22.15+ | everything |
| pnpm | 10.33.x | workspace management; selected by the root `packageManager` field |
| Python | 3.10–3.13 | local WhisperX and OpenCV Managed Programs |
| uv | latest | Python environment management |
| ffmpeg / ffprobe | recent stable | media processing |
| Chrome / Chromium | downloaded by `hypit runtime up` | local HTML rasterization |

Node.js and pnpm are the only hard requirements. The rest are needed only for live Builds.

Before the first local render, run `hypit programs up --runtime <profile> --endpoint <render-instance>`.
`hypit runtime up --runtime <profile>` also prepares the Profile's programs and starts its Worker.
This browser preparation does not depend on pnpm allowing dependency install scripts.
Use `hypit doctor --runtime <profile>` to inspect missing setup without installing it.

## Guide contents

| Guide | Topic |
|---|---|
| [Making videos with an Agent](./skill.md) | Creative direction, service choices and editable projects |
| [Packages and Extension](./packages.md) | Component, model and service ownership; installation and sharing |
| [Adding an author package](./author-packages.md) | Step-by-step: new component, Surface, vocabulary and preview, activation |
| [Models and Providers](./providers.md) | Select accounts and APIs; develop a Model or Provider package |
| [Runtime](./runtime.md) | Profile, Workspace, execution and lifecycle boundaries |
| [Studio localization](https://github.com/hypit-ai/hypit/blob/main/packages/studio/LOCALIZATION.md) | Translate interface messages; load a local JSON file or an installed language pack |
| [Conventions](./conventions.md) | Naming, module boundaries, wire data, TypeScript config |
