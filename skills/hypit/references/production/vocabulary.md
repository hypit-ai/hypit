# Choosing and extending author vocabulary

Read this when deciding which installed Surface should express a Treatment role, or whether the
production needs a new project Author Package.

## Search from the role

Name what the element must do in the work before choosing its implementation. Useful questions are:

- What does the viewer perceive, and why is it present?
- Is it Caption, independent Typography, A-roll, B-roll, MG, UI, Effect, Audio, or a new role?
- What does it consume and publish?
- Does it follow a Script Selection, a Moment, an explicit time span, or another component state?
- What changes over time, and what stays visually persistent?
- Which content belongs to this production, and which behavior should be reusable?

Query the likely package owners:

```bash
hypit vocabulary
hypit vocabulary @hypit/caption-fine
hypit vocabulary @hypit/media-pipeline --tag StillVideo
hypit vocabulary --visual text
```

Use a focused package and tag query before the first use of an unfamiliar Surface in the current
production. Query it again when the selected package or Distribution changes, or when `hypit check`
shows that an assumed declaration is not the installed one. Once the declaration is established in
the current context, ordinary edits do not require repeating the same query.

With no package argument, the command lists every package visible to the current Distribution and
project together with its tags and models. Use that inventory when the role is clear but the owner is
not. A focused package query then reports Surface attributes, children, ports, examples, and designed
previews, including the logical Module import when one physical package contributes several Modules.
The package README supplies exact behavior that is local to that installed implementation.
When the question requires more detail, inspect the relevant implementation and exported API. An
existing component can also provide a useful implementation example for a new project package.

Run Fragment libraries have a separate interface. A package can provide
Candidates while declaring no Markup Surfaces. Read [Runs](runs.md) and the library's
package-local Fragment documentation for those inputs and exports.

## Choose a component for its behavior

An installed Surface fits when its semantic role, inputs and outputs, temporal behavior, composition
ownership, and visual range match the intended work. Parameter differences such as words, colors,
spacing, or ordinary media inputs belong to authored configuration when the Surface already exposes
them.

A catalogue preview helps identify the component's visual role. Its declared inputs and behavior
show what can be adapted; its configured appearance in Studio shows how it serves this production.

Record the creative role in Treatment and express the implementation choice through Source imports
and elements. Those two places contain the useful reason and the exact choice.

## Create a project component as normal production work

When the work introduces a new visual role, structure, state change, interaction, or crafted behavior,
create a project Author Package under the project's `packages/`. This is a normal part of making a
video. Do not patch Hypit Core, the CLI, or an installed Distribution package to implement one video's
component. Author the behavior in the video's project package and select it through normal imports.

Keep the boundary useful:

- the package owns reusable mechanics, rendering behavior, input shapes, defaults and the vocabulary
  that explains them;
- Source and Recipe own this video's words, people, assets, timing, and chosen configuration;
- Runtime Profiles own external execution and credentials;
- Provider packages implement media tools and external services.

Read the installed `@hypit/hypit/author-kit` README for the public package boundary and a relevant component
for an implementation example. Give the new package its own Module identity and use the project
owner's scope; the selected Distribution owns the reserved `@hypit/*` namespace.

TypeScript imports use public SDK paths such as `@hypit/hypit/author-kit`, `@hypit/hypit/composition`,
`@hypit/hypit/text`, `@hypit/hypit/caption` or `@hypit/hypit/studio-adapter`. Source imports instead name logical Modules,
such as `@hypit/caption@1`. When learning from installed official source, translate its internal
workspace imports to the corresponding public SDK paths in the project package.

Describe the Surface's role, attributes and outputs with a small valid example so a future author
can select it. A visual preview makes its appearance recognizable; Studio shows the actual
configuration used in a production.

For existing Track composition, read [Tracks](tracks.md). For a new Track,
[Component design](component-design.md) shapes its visual idea, semantic behavior and useful controls.
[Track authoring](track-authoring.md) explains temporal inputs, spatial ownership, persistent
state, preset content and peer visual/audio outputs. [Caption authoring](caption-authoring.md) covers
a new speech-text family without rebuilding its transcript or timing.

[Studio and Companions](studio.md) covers timeline presentation and Inspector editing for the new
component.

[Component visuals](component-visuals.md) explains the actual Track and element representation,
with a drawing example. [System relationships](system.md) places it in the complete production.

## Let ordinary package management own distribution

The project's package manager installs and versions components. Hypit loads only packages selected
by Source or Run imports and their declared dependencies. Project packages resolve from the project;
reserved `@hypit/*` packages come from the selected Distribution. It does not scan the dependency
tree for possible components.

Keep a new component project-local while it serves this work. If its owner later wants to use it
across projects, send a versioned tarball or publish an npm/private-registry release and pin it in the
consumer project's `package.json` and lockfile. Sharing changes where the same package is installed;
it does not change the component model or require a Hypit-specific registry.

[Sharing a project package](component-sharing.md) owns the packaging, identity and upgrade details.
