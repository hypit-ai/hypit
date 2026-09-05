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

Then inspect only plausible vocabulary:

```bash
hypit vocabulary @hypit/caption-fine
hypit vocabulary @hypit/media-pipeline --tag StillVideo
hypit vocabulary --visual text
```

The command reports installed package declarations, Surface attributes, children, ports, examples,
and designed previews. The package README owns exact syntax and behavior. Read implementation files
only when authoring a new package or diagnosing an implementation defect.

## Judge fit by behavior, not resemblance

An installed Surface fits when its semantic role, inputs and outputs, temporal behavior, composition
ownership, and visual range match the intended work. Parameter differences such as words, colors,
spacing, or ordinary media inputs belong to authored configuration when the Surface already exposes
them.

A catalogue preview is a quick recognition aid. The configured Source in Studio is the evidence for
how the component behaves in this production. A poster that happens to resemble the reference cannot
establish fit, and a differently styled poster does not disqualify a component whose public design
range expresses the required role.

Record the creative role in Treatment and express the implementation choice through Source imports
and elements. Those two places contain the useful reason and the exact choice.

## Create a project component as normal production work

When the work introduces a new visual role, structure, state change, interaction, or crafted behavior,
create a project Author Package under the project's `packages/`. This is a normal part of making a
video. It does not require changing Hypit Core, the CLI, or an installed official component.

Keep the boundary useful:

- the package owns reusable mechanics, authored value shapes, rendering behavior, its own chrome and
  defaults, and the public vocabulary that explains them;
- Source and Recipe own this video's words, people, assets, timing, and chosen configuration;
- Runtime Profiles own external execution and credentials;
- Provider packages own privileged capabilities rather than visual composition.

Start from `examples/minimal-author-package/packages/example-component/` for the current package
shape. A close installed sibling can supply a bounded implementation pattern after its public
vocabulary is understood. The new package still owns its own Module identity, Types, Surfaces,
Fragments, Producers, activation descriptor, and README.

Every Surface that a future author should recognize needs concise vocabulary: what it means, what it
looks like, its attributes and ports, and a small valid example. Give a visual Surface a designed
poster that communicates its role at a glance. The poster is package documentation, while Studio
renders the actual configured work.

## Let ordinary package management own distribution

The project's package manager installs and versions components. Hypit loads only packages selected
by Source or Run imports and resolves project packages from the project first. It does not scan the
dependency tree for possible components.

Keep a new component project-local while it serves this work. If its owner later wants to use it
across projects, publish it as an ordinary versioned npm or private-registry package and pin it in the
consumer project's `package.json` and lockfile. Sharing changes where the same package is installed;
it does not change the component model or require a Hypit-specific registry.
