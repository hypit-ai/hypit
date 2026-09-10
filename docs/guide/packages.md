---
title: Packages and Extension
description: How video projects select components, models and services as ordinary packages.
---

Hypit separates what a video asks for from the code and services that fulfill it. A new graphic,
model or API source can be supplied by a package and selected by the project. Each package owns its
interface and implementation; the execution system runs the resulting dependency graph.

## What belongs where

| Part | Responsibility | Where it is selected |
| --- | --- | --- |
| Author component | Turns author inputs into media requests, visual behavior or other graph outputs | Source imports |
| Model | Defines an exact generation request and its outputs | Source imports |
| Provider Endpoint | Executes supported requests through an API or local tool | Runtime Profile |
| Credential store | Resolves the named credentials for an Endpoint | Runtime Profile |
| Result repository | Keeps a project's Build records and produced files | Project Result configuration |
| Distribution | Supplies the executable applications and official packages | Installed `@hypit/hypit` release |

For example, a Model describes a requested video, while a Provider maps that request to a service.
A ranking component describes how a board behaves, while the renderer draws its contribution into
the final composition. Both participate in the same graph, with explicit inputs and outputs.

## Components follow the work

A video's spatial structure is organized where that organization is useful. Media Track can present
an ordinary clip or picture; a project component can coordinate a moving video viewport, labels and
a diagram inside one scene. Independent captions or overlays can remain separate contributions.
Each component owns the content whose behavior belongs together.

For a spoken video, Script Selections and Moments let those components follow the meaning of the
performance. An authored animation can instead use seconds or frames on its declared clock.
[Film and Rendering](../quickstart/composition.md) explains how these contributions fit together.

New components normally live in the video's `packages/` directory and use the owner's package
scope. The project declares them with its ordinary package manager. When cross-project reuse is
useful, the owner can publish the same component as a versioned npm or private-registry package.
The consumer installs a chosen version and keeps its lockfile with the project.

## Installation and Source imports

The Skill, executable Distribution and video project are installed and updated separately. The
`@hypit/hypit` Distribution includes the official author packages and public extension APIs. Its selected
Runtime adapters can prepare additional service dependencies through `hypit runtime up`; optional
author assets can be installed with the precise `hypit packages install` command reported by the CLI.
A project's own component dependencies are managed in that project.

Source uses a logical Module address such as `@your-studio/scoreboard@1`. npm's installed package
version selects the implementation; the logical `@1` identifies its author interface. Building a
video uses those installed versions. Missing packages are reported with the information needed to
install them.

## Write and share an extension

An external package develops against public subpaths such as `@hypit/hypit/author-kit`,
`@hypit/hypit/composition`, `@hypit/hypit/model-kit` or `@hypit/hypit/endpoint-kit`. Use the selected `@hypit/hypit` release as a
development dependency, compile the extension to JavaScript, and ship its own code and assets. Its
`package.json` names an activation entry describing what it provides. The active Distribution
supplies the public Hypit APIs when it loads the selected extension.

- [Adding an Author Package](./author-packages.md) starts from an included, buildable component.
- [Component Anatomy](./component-anatomy.md) explains the roles within a component.
- [Models and Providers](./providers.md) explains new models, services and credentials.
- [Runtime](./runtime.md) covers Endpoint and credential configuration.

Exact SDK types and implementation examples live with the corresponding package's README and
source, which also ship in the Distribution.
