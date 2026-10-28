---
title: Adding an Author Package
description: Build a project component, use it in a video, and share it when useful.
---

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

The example includes TypeScript build configuration, Manifest, Author Declaration, Markup spelling, Fragment, Producers,
activation and a small preview Source. Its [README](https://github.com/hypit-ai/hypit/blob/main/examples/minimal-author-package/packages/example-component/README.md)
explains the exact files and package setup. The project can use its package manager's workspace or
local package dependency to install the component.

## Give the component a useful interface

Expose the decisions another video author would want to change: content, materials, placement,
appearance and meaningful events. Give the component absolute Window and Instant inputs for when the
scene exists or changes. Source may obtain those named values from a Narrative Projection or direct
Timeline declarations; the component uses the same interface in either case.

For an existing spoken performance, consume `PreparedMedia`, its absolute occurrence Window and
any temporal sampling relation the presentation needs as separate inputs. Other video inputs use the same
media path; Timeline contains neither clips nor source positions.
The [responsive explainer example](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/responsive-explainer)
shows a continuously playing video moving from full screen to a side portrait inside an HTML scene.
The [chat example](https://github.com/hypit-ai/hypit/tree/main/examples/semantic-composition/packages/chat-scene)
shows the same event interface consuming Instants produced from either direct or semantic declarations.

A Style-like declaration publishes its value under the bare authored id, such as `style={board-style}`.
Separate outputs can use descriptive suffixes such as `.visual`, `.audio` or `.track`. Document the
chosen names and the accepted values in the component's own vocabulary and README.

## Implement and inspect the scene

Use the narrow `author`, `producer`, `refinement` and `markup` public subpaths for their respective
responsibilities, and public domain subpaths for the values you consume. [Component Anatomy](./component-anatomy.md) explains how the Manifest, Author Declaration, Markup spelling, Fragment and
Producer cooperate. Keep project copy and media as inputs; draw the component's own panels, frames
and decoration in its implementation.

A preview Source gives authors a small example they can open or render. Inspect the states that
explain the behavior: entry, meaningful changes, held layout and exit. Check the component in the
actual composition too, where its content, space and timing have a purpose.

For richer interactive editing, add a Studio Companion. The
[Companion SDK](https://github.com/hypit-ai/hypit/blob/main/packages/studio-companion/README.md)
shows how to expose timeline Items, properties and source bindings. The rendering code and
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

## See a complete production

The [complex spoken explainer](https://github.com/hypit-ai/hypit/tree/main/examples/complex-explainer)
combines presenter framing, independent captions, website demonstrations and coordinated animated
scenes in one finished work. Its project guide follows each decision to the Source, Recipe or package
that owns it. The example distinguishes a useful component boundary from the separate choices to
expose parameters or design for reuse. Accepted material is supplied separately, so its default Run
can open and render the composition without another generation request.

[Watch the finished film](https://storage.googleapis.com/hypit-public-assets/assets/examples/complex-explainer/v1/20260914/final.mp4)
or follow the example's download instructions to open its accepted material in Studio.
