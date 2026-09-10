# Hypit Studio

The single official Web Studio for SVML. It opens an explicit Run Source,
traces its Film or Render target back to the semantic and visual projections
Studio can edit, runs deterministic Producers and explicitly permitted transient Needs, and composites the
resulting Tracks with HyperFrames.

```bash
cd /path/to/external-video-project
hypit studio --run build.svrun
```

When `--runtime` is omitted, Studio reads the resolved project's `.hypit/runtime`
selection made by `hypit runtime use`. It does not search parent projects for a
Profile. `--workspace` explicitly selects the project boundary; `--package-root`
overrides the author package resolution root when those locations intentionally differ.
Startup prints the project, Run, Profile and whether the Profile came from the command argument or
the project's selection file. Relative command-line paths start at the invoking directory;
`--workspace` selects the project without rebasing `--run` or `--runtime`.
The upper-left library is intentionally not a filesystem browser:

- Source is the exact Run + Author closure and writes back only the selected file;
- Tasks show one card per Build, with All, In progress and Finished filters. Active progress comes from
  the selected Runtime's read-only control interface; completed, failed and cancelled Builds come
  from the project's Result Repository. Saving a Result and an issue requiring attention remain
  visible, with the source Run and available progress or failure reason.
- Artifacts show top-level file Outputs whose declared MIME type is image, video or audio,
  including files already published by ongoing Builds. Composite Outputs retain their structure:
  the library does not extract their embedded resources. Forwarded file Outputs resolve to their
  owner; references to the same owner file share one card and retain their origins. Highlighted
  Outputs sort first, without excluding other media.

Source, Tasks and Artifacts use the shared `ui/sidebar-panel.ts` layout and navigation buttons. Each view
owns its toolbar content, data and actions; the shared shell owns geometry and navigation styling.

Views load on entry; returning to Tasks preserves its loaded list and selection. Explicit Refresh reads the latest state. There is no library polling.
Refresh replaces the current snapshot; scrolling to the end loads more finished Results. Failed
refreshes preserve the last view and show the error. Artifacts show project media through an icon sidebar: All media, Videos, Images and Audio.
The header names the category and offers Refresh. Selecting a Task adds its name beside the category in the existing header, establishing a session-local task context without shifting the list; its arrow opens that Build's media. The context remains across tab changes. Click its name to return to the selected Task, or clear it to browse project media. Task selection does not write Source, Result or Runtime state. Selected tasks expand the complete error text with a copy action. Source details are available on each media card. A media category is sent to the server, which
walks Result metadata pages until it collects a useful batch of matching files or reaches the end.
This keeps Build storage unchanged while avoiding empty category pages. The browser appends
older matches on scroll; Refresh reads the latest results for the current category.

Media cards use fixed-size square cells, contain the file at its own aspect ratio, and show up to two
wrapped name lines below. Selection colors the thumbnail area and name separately, without an
outer card border. Resizing the
sidebar distributes spare width between columns, then adds a column when another fixed-size
card fits. Card size stays unchanged. Video thumbnails decode a frame in the browser; audio waveforms are also
browser presentation, not additional Result files. Thumbnails load as their cells enter view.
The CLI carries the author's component name from compilation provenance into the Result's
optional Output `displayName`. The public Output identifier stays intact for references;
Outputs without a display name show that identifier unchanged. Double-click a name or press F2
to edit it in full; Enter or blur saves, Escape cancels. Failed saves retain the text and show the
reason. A completed, failed or cancelled Build's name is written through Result Repository
`updatePresentation` to that exact Output's `displayName`. Ongoing Builds become editable when
they finish, following the existing Result presentation-edit boundary. Renaming never changes
Output identity, referenced media files or other Builds' names for the same file.

The composition has a frame-snapped progress slider and current/total time.
Clicking a card opens the file in the central preview and pauses the composition. Images need
no transport; video and audio share the play/mute controls and a seconds-based scrubber above
the playback bar. The previous/next buttons skip five seconds for media, and step one frame
for the composition. Back to composition restores the existing composition playhead. Selecting
or seeking in the composition timeline also returns to it. Opening media changes no Source,
Run, or Candidate selection.

No project manifest, Studio database, output-directory scan or inferred campaign
folder structure is involved. With no selected Runtime, finished Result tasks and
Artifacts remain available. Preview and Source display work when the selected display
closure can resolve without Endpoint execution; active status and Provider-backed
transient processing require the selected Runtime.

## Opening and editing a session

The selected targets must reach one Film and its resolved time source. Studio rejects several
distinct Films in one view; use separate Runs/sessions for those. A SemanticTrack supplies the
Script lane and performance timing, including wordless Segments with media spans. A declared
ProgramSpace supplies authored animation time without a Script lane. Both show their component
tracks and use the same rendering and parameter-editing machinery. When the snapshot contains
a semantic timeline, its lane and label stay pinned directly below the time ruler while
component tracks scroll. Its presence follows the resolved semantic timeline, including
wordless content, rather than a component name or the presence of spoken words.

Open the URL printed by Vite. Studio requests port 5179 by default, accepts `--port`,
and Vite can choose another available port when it is occupied. Reuse that process
for edits to the same Run. The Run and loaded Author/Recipe files are watched and
recompiled together. Domain packages, Companion registry, Runtime and Result library
are opened at startup; restart this Studio process after changing those selections,
package code or imports that introduce new packages. Browser refresh does not reload
server-side package modules.

The Source pane can edit the selected `.svml`, `.svs` or `.svrun` file. The Inspector
shows project facts when no entity is selected and only declared writable fields for
the selected entity. A reference can resolve to a shared Frame or Recipe, so one edit
may affect several consumers. Structured fields use Apply/Reset for their local draft.
Check save status; source conflicts reject stale edits rather than overwrite newer files.

Timeline gestures use explicit temporal authority. Moving a shared Selection or
Moment edits Script and moves its consumers after recompilation. A parameter-based
handle edits its exact authored parameter. Fixed or derived values with no supported
inverse remain read-only. Seeing an entity does not promise every drag gesture.

A direct `during={selection}` move advances both endpoints by the same number of semantic
stops (distinct frame positions), so its duration may change. `at/for` moves its event and
offers a trailing duration trim; `until/for` offers the corresponding leading trim.
An Instant reference expression edits only its offset; a bare reference has an implicit zero offset.
`start/end` trims edit the corresponding expression; moving the window shifts both by the same
frame delta. Edited clock values and offsets are written in frames at the current ProgramSpace rate.
The semantic marker Inspector exposes exact anchor identities and, where a
declared handle supports it, offers choices among coincident anchors.
See [temporal author forms](../temporal-markup/EDITING.md) for the complete behavior.

Tasks and Artifacts are inspection surfaces; selecting an Artifact does not write a
Run Candidate. Use `build-record`/`satisfy` in the Run for explicit Output reuse.

## Component presentation

[Inspector fields](INSPECTOR.md) describes Where/When/How grouping, numeric unit conversion,
rich choices, fonts, color suggestions and exact Source writeback.

Studio is an application boundary. Core and domain computation do not import it or
register UI metadata. The installed Distribution explicitly selects one independent
Studio Companion per supported official domain. Packages actually selected by the
current Source closure may contribute their own Companion facet. The application
assembles both sets into one immutable registry for that session; there is no second
Studio profile, package scan or replacement map.

Project packages live at `<project>/packages/<package-basename>/`. Neither the
project nor its packages are added to the Hypit Distribution or contributor workspace.
The Host resolves selected project packages from the project first and official
`@hypit/*` imports from the read-only tool Distribution. The `@hypit/*`
namespace is Distribution-owned and cannot be shadowed by a project install.
External Companions compile against `@hypit/hypit/studio-adapter` and the other public `@hypit/hypit/*`
subpaths, with `@hypit/hypit` as a development dependency. The active Distribution supplies those APIs
at runtime. Ship the Companion's compiled JavaScript with its component package.

The companion owns what its Track means: matching, required same-Surface values,
entities, lane range, finite chrome, title and ordered text/material layers,
source bindings, Inspector fields and executed temporal lineage. Inspector fields
select real writable bindings and organize them under the Studio-owned
`Where / How / When` domains, optional companion-owned pages and sections. A
source binding is never shown merely because Studio can reach it. Material layers carry a
Resource id or Surface identity, never a Studio HTTP URL. Studio always owns
time formatting and transport resolution, so chrome and material cannot hide a
title or its time.
Studio owns session-wide behavior and chrome: Companion assembly, single-row overlap display,
fallback defaults, selection treatment, playback, zoom,
scrolling, the finite Inspector control set and source mutation transport. A
companion cannot ship arbitrary DOM or CSS into the application.

The finite control set includes scalar controls plus generic `list` and flat
`record` composition. Structured values are validated against the domain-owned
canonical schema, edited as a local draft, and written atomically through the
same revisioned `parameter.adjust` operation. Studio contains no Ranking,
Caption or Media list codec.

Inspector controls are Studio behavior, not browser defaults supplied by a
companion. Focused controls suspend transport shortcuts; numeric values use
non-spinning text entry so wheel scrolling cannot mutate Source; selects use
the Studio menu and keyboard navigation. Values still commit only on an
explicit change through the normal revisioned mutation path.

Temporal lineage comes from the exact executed graph selected by the Run. Studio indexes the
`TemporalInstant` and `TemporalWindow` records in each Track's dependency closure, including each
endpoint's author authority and direct consumer edge. Common timeline inverses come from that
authority rather than Companion declarations. Track Companions never infer semantic sources from SVML
attribute names, runtime id prefixes or coincident frame spans.

Opening Studio never spends and never creates a Build. Its display closure contains
the Candidates selected by the Run, deterministic Producers and exact Needs that
their Provider explicitly allows in transient authoring execution. The Runtime owns
Endpoint activation, Profile bindings, request-level `supports`, credentials and
invocation; Studio receives no Endpoint Registry and makes no decision from pricing,
process location, model name or package name. A Need without transient support stops
with its exact capability named. Existing media and completed Outputs enter through
ordinary Run Candidates selected with `satisfy`.

Studio and an encoded review use the same ordinary Run. Studio evaluates its
transient display closure in the browser; building that Run evaluates the
full target closure and sends the resulting HyperFrames document to the chosen
render Endpoint. A separate review Run is useful only when the author wants a
different Candidate selection. Its path and filename carry no execution
semantics.

Read [`@hypit/studio-adapter`](../studio-adapter/README.md) for the Companion ABI,
project activation example, value projection and Inspector declarations.
