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
pnpm check            # TypeScript type-check: v1 + v2
pnpm test             # full test suite: v1 + v2
```

| Command | What it runs |
|---|---|
| `pnpm check:v1` | `tsc -p tsconfig.json --noEmit` — retained v1 research oracle |
| `pnpm check:v2` | `tsc -p tsconfig.v2.json --noEmit` — all v2 workspace packages |
| `pnpm test:v1` | `node --import tsx --test 'test/**/*.test.ts'` |
| `pnpm test:v2` | `node --import tsx --test 'packages/*/test/**/*.test.ts' 'tools/*.test.mjs'` |

See [Testing](./testing.md) for environment-gated tests and test patterns.

## Repository layout

```text
svml/
├── packages/              64 v2 workspace packages (the active system)
├── spec/                  7 normative specification documents
├── docs/                  VitePress documentation site
├── examples/              v2 examples and v1 regression fixtures
├── services/              Python sidecar services (whisperx, image-opencv)
├── src/                   v1 legacy source (regression evidence only)
├── stdlib/                v1 kernel definitions and runtime
├── test/                  v1 test suite
├── tools/                 boundary tests and build scripts
├── package.json           root workspace manifest
├── pnpm-workspace.yaml    workspace: [packages/*]
├── tsconfig.json          v1 TypeScript config
└── tsconfig.v2.json       v2 TypeScript config
```

`src/`, `stdlib/` and `test/` are the v1 research oracle, retained as regression evidence. They
are not the v2 API.

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
