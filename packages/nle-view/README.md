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

`projectNleTimeline()` joins the Project and this persistent View with invocation-local Item observations into an
`NleTimelineScene`. The Scene is the finite read model consumed by a Workbench frontend: it contains Track rows,
Item geometry, title, Studio-owned tone and chrome tokens, body layers and available edit affordances. It is never
serialized. Package presentation and preview caches may contribute observations, but they cannot introduce DOM,
CSS, Track structure or another persistent editor model.

Package-owned Component and Adjustment meaning enters through the optional
`hypit.nle-timeline-presentation@1` facet. A presentation is selected by the exact Module symbol and may contribute
a display name, one finite Studio tone and chrome, a preferred Track height, and factual text layers derived from
that Item's package-owned parameters. It may also return static component artwork or Item-specific poster bytes; the Host still owns the URL,
cache and finite `repeat-x`／`cover`／`contain` layout. It cannot create Items or Tracks, change time, expose browser
routes, or inject markup. Media thumbnails,
storyboards and waveforms remain Host observations because their resources and caches are transport concerns.
`mergeNleTimelineItemObservations()` composes package facts with Host preview layers for one Item and rejects
conflicting titles or presentation tokens before the finite Scene reaches the browser.

The optional `hypit.nle-inspector-presentation@1` facet projects one transient Inspector Scene. Packages place
Sections in the shared `where`／`when`／`how` domains and may give a Section a task Page; the Workbench shows a Page
strip only when the active domain contains more than one page. Sections remain the semantic parameter groups and
Fields remain the editable or factual values. Consecutive Fields may name one presentation row for compact paired
controls such as a Caption unit's start and end. Section owners preserve package, media and shared-resource
provenance for edit routing and impact display; they are not another visible heading hierarchy. The Workbench shows
shared-resource scope where it changes the meaning of an edit and keeps implementation owners out of the ordinary UI.

The package-owned `heightPx` is a rebuildable default, not persistent layout state. A Track uses the largest preferred
height contributed by its Items. Without one, projection uses 32 px for Adjustment-only Tracks, 48 px for Audio,
52 px for ordinary Component or Composition Items, and 76 px for Picture media with a visual preview. Empty Picture
Tracks use 52 px. A persisted View height always wins over all of these defaults.
