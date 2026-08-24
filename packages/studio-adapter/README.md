# `@hypit/studio-adapter`

The stable companion-package ABI understood by Hypit Studio. It carries only
presentation, lineage, inspector and interaction DTOs plus helpers that do not
encode the official video UI policy. Domain packages do not depend on it.

`StudioAdapterContext.temporalBindings` exposes the executed Point/Window records in the selected
Track closure, including projection expressions, source identity and direct consumer inputs.
`temporalLineageFor()` joins a domain entity to those edges through the identity of a value consumed
beside the projection; it does not inspect author attribute names.

A project companion contributes package-local adapter ids through
`createStudioAdapterHostFacet()`. The Host qualifies them with the selected
physical package identity, so executable package code cannot impersonate an
official adapter. Project profiles select those packages explicitly; Studio
does not scan `node_modules` for plugins.

Inspector editing deliberately has two declarations:

- `bindings` names exact author endpoints, including explicit reference paths
  into authored elements or SVS Recipes. A binding is not visible by itself;
- `inspector` selects writable bindings and gives them a `where`, `how` or
  `when` domain, an optional package-owned page, a section and one of Studio's
  finite controls (`text`, `number`, `boolean`, `select`, `color`, `list` or
  `record`). A domain Recipe may declare a shared canonical-value schema; the
  companion chooses its presentation while Studio derives and validates the
  finite structured control without learning domain syntax.

This keeps source traversal, timeline inverses and editor presentation from
silently becoming one policy. Studio resolves the declarations against the
current Source closure, publishes only real writable fields, renders all DOM
and CSS itself, and commits changes through `parameter.adjust`.

Structured controls keep a local draft and commit one complete canonical value.
Their codec is the author language (`@hypit/svs` for Recipe values), not an
adapter callback. Companions cannot inject DOM, CSS, parsing code or filesystem
mutations. Official companions also use explicit field tables: an undeclared
new domain property fails adapter loading instead of inheriting UI from its name.
