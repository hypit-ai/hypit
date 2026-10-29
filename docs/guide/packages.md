---
title: Packages and Extension
description: How video projects select components, models and services as ordinary packages.
---

Hypit projects install reusable components, generation models and services as ordinary packages.
The project selects each package where it is used.

## What belongs where

| Part | Responsibility | Where it is selected |
| --- | --- | --- |
| Author component | Turns author inputs into media requests, visual behavior or other outputs | Source imports |
| Model | Defines an exact generation request and its outputs | Source imports |
| Provider Endpoint | Executes supported requests through an API or local tool | Runtime Profile |
| Credential store | Resolves the named credentials for an Endpoint | Runtime Profile |
| Results | Keeps a project's Build records and produced files | Project `.hypit/results` |
| Hypit installation | Supplies the commands and included packages | Installed `@hypit/hypit` release |

For example, a Model describes a requested video, while a Provider maps that request to a service.
A ranking component describes how a board behaves, while the renderer draws its contribution into
the final composition. Both use explicit inputs and outputs.

## Components follow the work

A video's spatial structure is organized where that organization is useful. Visual Track can present
an ordinary clip or picture; a project component can coordinate a moving video viewport, labels and
a diagram inside one scene. Independent captions or overlays can remain separate contributions.
Each component owns the content whose behavior belongs together.

For a spoken video, a Narrative Projection can reveal Script Selections and Moments as the absolute
Windows and Instants those components consume. An authored animation can produce the same values
directly from seconds or frames on its declared clock.
[Film and Rendering](../quickstart/composition.md) explains how these contributions fit together.

New components normally live in the video's `packages/` directory and use the owner's package
scope. The project declares them with its ordinary package manager. When cross-project reuse is
useful, the owner can publish the same component as a versioned npm or private-registry package.
The consumer installs a chosen version and keeps its lockfile with the project.

## Installation and Source imports

The Skill, Hypit installation and video project are installed and updated separately. Project
components are ordinary project dependencies. Selected local services can prepare their files and
processes through `hypit runtime up`.

Source uses a component address such as `@your-studio/scoreboard@1`. The project package manager
selects the installed release and records it in the lockfile. Missing packages are reported with the
name needed for installation.

## Write and share an extension

Create a component under the video's `packages/` directory and install it with the project's package
manager. The package ships its own code, assets, README and examples. Its README names the public
TypeScript APIs for the selected Hypit release.

- [Adding an Author Package](./author-packages.md) starts from an included, buildable component.
- [Component Anatomy](./component-anatomy.md) explains how to choose a component boundary and public inputs.
- [Models and Providers](./providers.md) explains new models, services and credentials.
- [Runtime](./runtime.md) covers Endpoint and credential configuration.

Exact APIs and implementation examples live with the corresponding installed package README.
