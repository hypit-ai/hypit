# `@hypit/canvas-view`

Persistent workspace projection for arbitrary authored subjects. An Item owns only its View-local identity
and layout; Media, generation requests, components, Programmes and their references remain owned by their
domain packages. Selection, viewport and zoom remain Host Session state.

The package exposes pure projection and edit planners over the domain-neutral Author Structure Document.
Its declaration facet validates `View` structure and subject references while contributing zero Records and
zero graph Components. It does not publish a Canvas Program, Canvas Node kind registry or AuthorGraph value.
