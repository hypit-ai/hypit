---
title: Adding a Project Component
description: Build an NLE component, use it in a video, and share it when useful.
---

Creating a component is part of making a video. Start with the behavior the scene needs: what stays
together, what changes, and which parameters or local events drive it. Ordinary media remains a
direct NLE item; shared visual behavior can belong to one project Component.

## Start from a complete package

The installed `@hypit/hypit` Distribution includes
[`examples/semantic-composition/packages/audiovisual-title-card`](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/audiovisual-title-card).
Copy that directory into your video's `packages/` directory. Give its package and logical component Module
your own scope and name, and replace the fixture's `workspace:*` dependencies with the selected Hypit release.

From the copied package directory:

```bash
npm install --save-dev @hypit/hypit@<selected-release>
npm run build
```

The example includes TypeScript configuration, a `ProgramSource`, its independent HTML
implementation, flat-NLE resolvers and optional package-owned parameter editing. Its
[README](https://github.com/hypit-ai/hypit/blob/main/examples/semantic-composition/packages/audiovisual-title-card/README.md)
explains the boundaries. The project can use its package manager's workspace or local package
dependency to install the component.

## Give the component a useful interface

Expose the decisions another video author would want to change: content, materials and appearance.
The parent NLE owns direct exact placement, trim, draw order and undo. Package parameters own the
component's shared internal behavior; exact local times may appear inside those parameters when the
package needs animation. A resolver turns the installed package instance into an ordinary AVIR
`ProgramSource`, Picture Operator or Audio Operator only when preview or export asks for it.

For an existing performance, keep the media as an ordinary Media item unless the component genuinely
owns shared behavior around it. Caption or semantic timing can remain source-local data and be baked
through an explicit materializer; the component does not need a global Timeline object.

A Style-like declaration publishes its value under the bare authored id, such as `style={board-style}`.
Separate outputs can use descriptive suffixes such as `.visual`, `.audio` or `.track`. Document the
chosen names and the accepted values in the component's own vocabulary and README.

## Implement and inspect the scene

Follow the included package README for the TypeScript APIs used by the selected release.
[Component Anatomy](./component-anatomy.md) explains how to design the component's public choices.
Keep project copy and media as inputs; draw the component's own panels, frames
and decoration in its implementation.

A preview Source gives authors a small example they can open or render. Inspect the states that
explain the behavior: entry, meaningful changes, held layout and exit. Check the component in the
actual composition too, where its content, space and timing have a purpose.

## Use and share it

Install the package in the video project, then create an ordinary NLE Component Present whose symbol names
the package's logical Module and component:

```json
{
  "kind": "present",
  "source": "component",
  "component": {
    "module": { "name": "@your-scope/my-component" },
    "name": "title-card"
  },
  "parameters": { "title": "Opening" }
}
```

An Agent, CLI command or editor may author that Item, but the persisted project contains only direct
placement and parameters. The component's README should document its symbol, parameters, useful creative
choices and a picture of the behavior.

Keep the package with its video project while it serves that work. To share it, choose a release
version, compile and pack its code and assets with `npm pack`, or publish under the owner's scope
in npm or a private registry. For registry publication, remove `private: true` and supply the normal
package metadata. Consumers install the selected version and commit their package-manager lockfile.
A Hypit repository checkout or upstream pull request is not needed to use the component.

## See a complete production

The historical [complex spoken explainer](https://github.com/hypit-ai/hypit/tree/main/examples/complex-explainer)
combines presenter framing, independent captions, website demonstrations and coordinated animated
scenes in one finished work. Its project guide follows each decision to the Source, Recipe or package
that owned it. The example distinguishes a useful component boundary from the separate choices to
expose parameters or design for reuse. It is a production reference, not a current package API starter.

[Watch the finished film](https://storage.googleapis.com/hypit-public-assets/assets/examples/complex-explainer/v1/20260914/final.mp4)
or follow the example's download instructions to inspect and reuse its accepted material.
