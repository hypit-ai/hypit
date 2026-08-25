# `@hypit/studio-adapter`

The stable companion-package ABI understood by Hypit Studio. It carries only
presentation, lineage, inspector and interaction DTOs plus helpers that do not
encode the official video UI policy. Domain packages do not depend on it.

`StudioTrackCompanionContext.temporalBindings` exposes the executed Instant/Window records in the selected
Track closure, including projection expressions, source identity and direct consumer inputs.
`temporalLineageFor()` joins a domain entity to those edges through the identity of a value consumed
beside the projection; it does not inspect author attribute names. No match is read-only, one match
is used, and several matches are an error rather than a first-result guess. The generic terminal
fallback tries only the terminal object's exact `subjectId`/`authoredId`; renderer ids and marker ids
are not alternate guesses.

Track Companions match terminal outputs by complete `TypeRef` and their authoring origin by complete
`ModuleRef + Surface`; Film and Script companions use the same versioned origin match. Short Type
and module names remain available for UI text and diagnostics but never decide which Companion is
allowed to interpret a value.

Trace references retain the exact author input name and resolved TypeRef. A Companion that needs a
CaptionDocument or another referenced domain value selects that declared edge; it never scans all
values for a familiar object shape. Child entities follow the same rule: when an optional Source id
was omitted, a Companion may name the exact domain Spec Type whose public `id` owns that child.
Studio then recovers the Source range from the typed observed Record, without ordinal matching.

A project companion contributes package-local Track Companion ids through
`createStudioTrackCompanionHostFacet()`. The Host qualifies them with the selected
physical package identity, so executable package code cannot impersonate an
official Companion. Project profiles select those packages explicitly; Studio
does not scan `node_modules` for plugins.

The same host facet can contribute Film and Script boundary companions. A Film companion declares
the references that select one semantic axis and its terminal Tracks. A Script companion owns raw
source observation and marker adjustment. Studio core only matches and invokes these declarations;
it does not import either domain package.

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
Their codec is the author language (`@hypit/svs` for Recipe values), not a
Companion callback. Companions cannot inject DOM, CSS, parsing code or filesystem
mutations. Official companions also use explicit field tables: an undeclared
new domain property fails Companion loading instead of inheriting UI from its name.
