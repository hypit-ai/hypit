---
title: Development Guide
description: Getting started with Narratage development.
---

# Development Guide

## Prerequisites

| Tool | Version | Required for |
|---|---|---|
| Node.js | 22+ | everything |
| pnpm | 10.33.x | workspace management; selected by the root `packageManager` field |
| Python | 3.10–3.13 | local WhisperX and OpenCV Managed Programs |
| uv | latest | Python environment management |
| ffmpeg / ffprobe | recent stable | media processing |
| Chrome / Chromium | managed by HyperFrames | local HyperFrames rendering |

Node.js and pnpm are the only hard requirements. The rest are needed only for live Builds.

## Daily workflow

```bash
corepack enable
pnpm install --frozen-lockfile # after pulling or changing dependencies
pnpm check            # TypeScript type-check
pnpm test             # full test suite
```

| Command | What it runs |
|---|---|
| `pnpm check` | `tsc -p tsconfig.json --noEmit` |
| `pnpm test` | package, service-adapter and repository-boundary tests through Node's test runner |

See [Testing](./testing.md) for environment-gated tests and test patterns.

## Repository layout

```text
narratage/
├── packages/              workspace packages
├── docs/                  VitePress documentation site
├── examples/              runnable example sources
├── services/              Python services (whisperx, image-opencv)
├── test/                  repository boundary tests and shared fixtures
├── package.json           root workspace manifest
├── pnpm-workspace.yaml    workspace: [packages/*]
└── tsconfig.json          TypeScript config
```

## Guide contents

| Guide | Topic |
|---|---|
| [Package architecture](./packages.md) | The five layers, dependency rules, package anatomy, facets |
| [Adding an author package](./author-packages.md) | Step-by-step: new component, Surface, activation |
| [Adding a Provider](./providers.md) | Step-by-step: new Endpoint adapter |
| [Runtime](./runtime.md) | Profile, Workspace, execution and lifecycle boundaries |
| [Testing](./testing.md) | Test runner, patterns, examples, boundary tests |
| [Conventions](./conventions.md) | Naming, module boundaries, wire data, TypeScript config |
