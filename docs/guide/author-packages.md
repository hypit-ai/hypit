---
title: Adding an Author Package
description: Build a project component, use it in a video, and share it when useful.
---

# Adding an Author Package

Creating a component is part of making a video. Start with the behavior the scene needs: what stays
together, what changes, and which events drive it. An ordinary media presentation may use Media
Track. A video viewport that moves aside while a diagram appears can belong to one project component,
with independent captions remaining separate.

## Start from a complete package

The installed `@hypit/hypit` Distribution includes
[`examples/minimal-author-package/packages/example-component`](https://github.com/hypit-ai/hypit/tree/main/examples/minimal-author-package/packages/example-component).
Copy that directory into your video's `packages/` directory. Give its package and Module your own
scope and name, and replace the fixture's `workspace:*` Hypit development dependency with the
Distribution release used by the project.

From the copied package directory:

```bash
npm install --save-dev @hypit/hypit@<selected-release>
npm run build
```

The example includes TypeScript build configuration, Manifest, Surface, Fragment, Producers,
activation and a small preview Source. Its [README](https://github.com/hypit-ai/hypit/blob/main/examples/minimal-author-package/packages/example-component/README.md)
explains the exact files and package setup. The project can use its package manager's workspace or
local package dependency to install the component.

## Give the component a useful interface

Expose the decisions another video author would want to change: content, materials, placement,
appearance and meaningful events. A transition can accept a Moment for when the layout changes and
a Selection for how long the scene appears. A pure animation can accept authored event times instead.
Project those inputs onto the chosen clock, then use the resulting schedule to draw the scene.

For an existing spoken performance, consume its SemanticTrack so picture sampling follows the same
takes and source positions as the speech. Other video inputs enter the timeline as normalized media.
The [responsive explainer example](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/responsive-explainer)
shows a continuously playing video moving from full screen to a side portrait inside an HTML scene.
The [chat example](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/chat-scene)
shows the same event interface accepting authored times or Script Moments.

A Style-like Surface publishes its value under the bare authored id, such as `style={board-style}`.
Separate outputs can use descriptive suffixes such as `.visual`, `.audio` or `.track`. Document the
chosen names and the accepted values in the component's own vocabulary and README.

## Implement and inspect the scene

Use `@hypit/hypit/author-kit` for the author package API and public domain subpaths for the values you
consume. [Component Anatomy](./component-anatomy.md) explains how the Manifest, Surface, Fragment and
Producer cooperate. Keep project copy and media as inputs; draw the component's own panels, frames
and decoration in its implementation.

A preview Source gives authors a small example they can open or render. Inspect the states that
explain the behavior: entry, meaningful changes, held layout and exit. Check the component in the
actual composition too, where its content, space and timing have a purpose.

For richer interactive editing, add a Studio Companion. The
[Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-adapter/README.md)
shows how to expose timeline entities, properties and source bindings. The rendering code and
Companion are separate contributions in the same package.

## Use and share it

Import the installed component's logical Module in Source:

```svml
<import as="mine" from="@your-studio/my-component@1"/>
```

Use its declared elements and outputs in the composition. `hypit vocabulary` exposes their authored
interface; `hypit check` checks a Source or Run. The component's README should include a copyable
example, its outputs, useful creative choices and a picture of the behavior.

Keep the package with its video project while it serves that work. To share it, choose a release
version, compile and pack its code and assets with `npm pack`, or publish under the owner's scope
in npm or a private registry. For registry publication, remove `private: true` and supply the normal
package metadata. Consumers install the selected version and commit their package-manager lockfile.
A Hypit repository checkout or upstream pull request is not needed to use the component.
