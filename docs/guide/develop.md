---
title: Development Guide
description: Getting started with Narratage development.
---

# Development Guide

## Prerequisites

| Tool | Version | Required for |
|---|---|---|
| Node.js | 22+ | everything |
| pnpm | 9+ | workspace management |
| Python | 3.10–3.13 | WhisperX and OpenCV [sidecar services](./services.md) |
| uv | latest | Python environment management |
| ffmpeg / ffprobe | recent stable | media processing |
| Chrome / Chromium | recent stable | HyperFrames rendering |

Node.js and pnpm are the only hard requirements. The rest are needed only for live Builds.

## Daily workflow

```bash
pnpm install          # after pulling or changing dependencies
pnpm check            # TypeScript type-check
pnpm test             # full test suite
```

| Command | What it runs |
|---|---|
| `pnpm check` | `tsc -p tsconfig.json --noEmit` |
| `pnpm test` | `node --import tsx --test 'packages/*/test/**/*.test.ts' 'tools/*.test.mjs'` |

See [Testing](./testing.md) for environment-gated tests and test patterns.

## Repository layout

```text
narratage/
├── packages/              78 workspace packages
├── spec/                  7 normative specification documents
├── docs/                  VitePress documentation site
├── examples/              runnable example sources
├── services/              Python sidecar services (whisperx, image-opencv)
├── tools/                 boundary tests and build scripts
├── package.json           root workspace manifest
├── pnpm-workspace.yaml    workspace: [packages/*]
└── tsconfig.json          TypeScript config
```

## Guide contents

| Guide | Topic |
|---|---|
| [Package architecture](./packages.md) | The four layers, dependency rules, package anatomy, facets |
| [Adding an author package](./author-packages.md) | Step-by-step: new component, Surface, activation |
| [Adding a Provider](./providers.md) | Step-by-step: new Endpoint adapter |
| [Runtime Profile](./runtime-profile.md) | JSON and TypeScript configuration, diagnostics, Build archive |
| [Local services](./services.md) | WhisperX and OpenCV sidecar setup |
| [Testing](./testing.md) | Test runner, patterns, examples, boundary tests |
| [Conventions](./conventions.md) | Naming, module boundaries, wire data, TypeScript config |
