# `@hypit/nle-view`

Persistent editing projection for one `hypit.nle@1` Project.

The NLE Project owns audiovisual composition facts. The View owns only the durable editor grid, Track guards and
linked-editing Groups. Changing this file never changes preview or export output. Selection, playhead, zoom, scroll,
hover and in-progress gestures remain Workbench Session state. Thumbnails, waveforms and component previews are
rebuildable Workbench caches and are never serialized here.

```json
{
  "format": "hypit.nle-view@1",
  "id": "film-main",
  "name": "Film timeline",
  "revision": 0,
  "project": { "path": "film.nle.json" },
  "editRate": { "numerator": 30, "denominator": 1 },
  "tracks": [{ "track": "picture-main", "locked": false }],
  "groups": []
}
```

The Project and View have independent revisions. A stale Track or Item reference may be rejected or cleaned by the
Host without invalidating the audiovisual Project; ordinary files do not require a cross-file distributed transaction.
The explicit Project path may begin with parent segments when Project and View live in sibling owner directories,
such as `views/film.nle-view.json` and `edits/film.nle.json`. Parent segments cannot reappear after the owned path
begins, and the application Host still verifies the resolved path against the real Project Root.

Workbench uses View revision only for View concurrency. Track height, lock, Group and name changes never replace the
Programme preview. `editRate` remains the persisted editing grid; a Host may initialize its invocation-local preview
sampling policy from that value, but the policy and its generation are Session state. See the
[NLE Service API](../nle-service/API.md).

`projectNleTimeline()` joins the Project and this persistent View with invocation-local Item observations, semantic
capabilities and one product affordance policy into an
`NleTimelineScene`. The Scene is the finite read model consumed by a Workbench frontend: it contains Track rows,
Item geometry, title, Studio-owned tone and chrome tokens, body layers and available edit affordances. It is never
serialized. Package presentation and preview caches may contribute observations, but they cannot introduce DOM,
CSS, Track structure, editing authority or another persistent editor model. `resolveNleTimelineItemCapabilities()`
combines domain source kind, explicit package occurrence authoring, View locks and direct relations before the product
policy decides which of those capabilities become visible handles. The same semantic capabilities guard accepted
Timeline transactions again at the Host boundary.

`projectNleCanvas()` applies the same separation to the Monitor overlay. It returns explicit `translate` and corner
`resize` affordances for NLE-owned Picture Layouts rather than a generic `transform` flag. A referenced layout is
writable only when every current user is on an unlocked Track. Package-internal visual objects do not become handles
merely because a renderer can expose DOM or pixels.
An invocation-local Media observation may add the Source Picture extent. The Canvas Scene then projects both the
authored Item frame and the fitted content rectangle without persisting media dimensions in the Project or View.
Corner resize preserves the current authored frame ratio by default; an explicit free-resize gesture may change it.
Selection, the temporary drag rectangle and any temporary foreground presentation remain Workbench Session state.

`resolveNleSpatialItemCapabilities()` is the complete headless capability observation, independent of the controls a
particular product chooses to show. It distinguishes mutation of the current owner from rebinding one Item: changing a
shared Layout requires every affected Track to be writable, while unlinking or linking changes only the selected Item.
`assertNleSpatialEditAllowed()` guards application commands against that same observation. A Workbench may expose only
translate and corner resize while Agent tools or another adapter use fit, focus and explicit Layout sharing; the
frontend-visible subset never narrows the application service itself.

Package-owned Component and Adjustment timeline appearance enters through the optional
`hypit.nle-timeline-presentation` facet. A presentation is selected by the exact Module symbol and may contribute
a display name, one finite Studio tone and chrome, a preferred Track height, and factual text layers derived from
that Item's package-owned parameters. It may also return static component artwork or Item-specific poster bytes; the Host still owns the URL,
cache and finite `repeat-x`／`cover`／`contain` layout. It cannot create Items or Tracks, change time, expose browser
routes, or inject markup. Media thumbnails,
storyboards and waveforms remain Host observations because their resources and caches are transport concerns.
`mergeNleTimelineItemObservations()` composes package facts with Host preview layers for one Item and rejects
conflicting titles or presentation tokens before the finite Scene reaches the browser.

The optional `hypit.nle-inspector-presentation` facet projects one transient Inspector Scene. Packages place
Sections in the shared `where`／`when`／`how` domains and may give a Section a task Page; the Workbench shows a Page
strip only when the active domain contains more than one page. Sections remain the semantic parameter groups and
Fields remain the editable or factual values. Consecutive Fields may name one presentation row for compact paired
controls such as a Caption unit's start and end. Section owners preserve package, media and shared-resource
provenance for edit routing and impact display; they are not another visible heading hierarchy. The Workbench shows
shared-resource scope where it changes the meaning of an edit and keeps implementation owners out of the ordinary UI.
An Operator publishes one Inspector presentation and one authoring implementation for all of its Applications.
The Host supplies a stable address that distinguishes a Programme-scoped Adjustment from a Picture/Audio Application
nested in a Present. Nested Section ids include that Application identity, so several uses of the same Operator on one
Item remain independently editable without inventing an effect registry in the View.

The package-owned `heightPx` is a rebuildable default, not persistent layout state. A Track uses the largest preferred
height contributed by its Items. Without one, projection uses 32 px for Adjustment-only Tracks, 48 px for Audio,
52 px for ordinary Component or Composition Items, and 76 px for Picture media with a visual preview. Empty Picture
Tracks use 52 px. A persisted View height always wins over all of these defaults.
