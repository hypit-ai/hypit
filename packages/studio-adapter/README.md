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
