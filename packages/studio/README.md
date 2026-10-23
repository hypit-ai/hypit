# Hypit Studio

For direct picture inspection, `hypit snapshot --studio <studio-url>` reads the current compiled
`HtmlProgram` from `GET /__studio/document` and its existing `/__studio/material/<resource>`
resources. `GET /__studio/visual.html` exposes the same materialized picture without the interactive
Studio playback shim or audio. Both representations come from the same compilation as the displayed
preview. The snapshot invocation uses the selected Runtime Profile's frame Provider and creates no
Build. During a pending Source compilation the export route reports that state; a failed update
reports its error instead of returning the previous picture as current.

The single official Web Studio for SVML. It opens an explicit Run Source,
traces its Film or Render target back to the semantic and visual projections
Studio can edit, runs deterministic Producers and explicitly permitted transient Needs, and composites the
resulting Tracks with HTML renderer.

`@hypit/studio/cli` exports Studio's `hypit.cli-command@1` contribution. The root CLI Host selects it
through the installed Distribution manifest; Studio does not own or wrap the Hypit executable.

```bash
cd /path/to/external-video-project
hypit studio --run build.svrun
```

When `--runtime` is omitted, Studio reads the resolved project's `.hypit/runtime`
selection made by `hypit runtime use`. It does not search parent projects for a
Profile. `--project` explicitly selects the project boundary; `--package-root`
overrides the author package resolution root when those locations intentionally differ.
Startup prints the project, Run, Profile and whether the Profile came from the command argument or
the project's selection file. Relative command-line paths start at the invoking directory;
`--project` selects the project without rebasing `--run` or `--runtime`.
The upper-left library is intentionally not a filesystem browser:

- Source is the exact Run + Author closure and writes back only the selected file;
- Tasks show one card per Build, with All, In progress and Finished filters. Active progress comes from
  the selected Runtime's read-only control interface; completed, failed and cancelled Builds come
  from the project's Result Repository. Saving a Result and an issue requiring attention remain
  visible, with the source Run and available progress or failure reason.
- Artifacts show top-level file Outputs whose declared MIME type is image, video or audio,
  including files already published by ongoing Builds. Value-document Outputs retain their structure:
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

The CLI prints the actual session URL and its direct `#comments` URL after the server chooses a port.
Open the latter to review the current composition before export. Browser playback creates no export
Build or encoded video; an export remains a separate Run execution when the user wants the file.

The top-right **Studio / Comments** tabs change the layout around the same composition player.
Comments gives the picture the available height with a notes column on the right. Click the picture
to play or pause; the wider progress control seeks, with a hovered-frame preview that leaves the
main playhead alone. The hover picture uses one lazy, muted instance of the current preview document,
released when leaving Comments. It needs no Build or thumbnail files.

Studio retains picture selection and its right-click menu for overlapping Companion Items.
Comments uses viewing controls without selecting objects. Switching views preserves the composition
time and Studio's selection; comments themselves only refer to a time and the user's words.

### Comments are project files

Studio saves comments in `<workspace>/FEEDBACK.json`, creating it on the first saved comment.
This path is Studio's project-file convention, rooted in the resolved workspace; it is independent
of the Runtime, Result repository and Agent implementation.
Each comment records its reviewed Run relative to that workspace, so the file can hold notes for
several Runs while the UI shows the current Run. Times are seconds, including fractional seconds:

```json
{
  "comments": [
    {
      "id": "caption-size",
      "run": "runs/main.svrun",
      "at": 12.5,
      "text": "Make this caption larger.",
      "resolved": false
    }
  ]
}
```

`id`, `run`, `at` and `text` are required. `resolved` defaults to false; setting it to true marks
the comment complete, and false reopens it. Deleting removes the entry. Following a note seeks to
its saved time; a changed composition can show something different at that time.

Focusing the comment composer pauses the picture and captures the current frame. The time chip
captures a new time. The draft keeps its time while the user writes. Click a saved timestamp to
revisit it. Comments can be edited, completed, reopened and deleted from the UI or by editing the file.
The list is ordered by timestamp. Its `#1`, `#2` labels follow submission order within the current
Run (the file's array order) and appear beside the completion control. Changing a timestamp or
filtering Open/Done preserves those numbers; deleting a note closes its gap in the numbering.
The stored `id` remains the stable identity. Clicking a note's text or time seeks
to its frame. The composer has an icon-only send control; emoji and drawing buttons are inactive placeholders.
Clicking outside the selected note clears its highlight without discarding an edit. Enter sends a
new note or saves an edited one; Shift+Enter or Alt+Enter inserts a line break. IME confirmation stays
with the text input rather than submitting the comment.

File changes refresh comments through filesystem events, without polling or recompiling the video.
Studio reads the file afresh for each edit, preserves unrelated notes and project-added fields, and
rejects an edit to a comment that has changed since it was displayed. An invalid manually edited
file remains intact and its error is shown. Unsent text stays in the browser. Agent notification is
a separate, planned connection; **Send comment** currently saves the note only.

### Composition editing

The Properties heading remains stable while package-owned **Where / When / How** domains appear beneath it.
When a selected terminal operation supports temporary preview participation, **Include in preview** controls
that Item in the current Studio session. Several Items can be omitted independently. Seeking, playback and
recompilation preserve live Item choices, while Comments, Result previews, Source and export remain authoritative.
Reloading the page clears the preview mask.

The selected targets must reach one Film and its resolved time source. Studio rejects several
distinct Films in one view; use separate Runs/sessions for those. A Timeline supplies the complete
program range and the ruler always shows program time. Each package-owned temporal-domain Companion
may add an exact Projection view. Script Studio gives every Narrative Projection two rows: mapped
Segments and projected word evidence. Selection and Moment objects that exist only to invert a
Track/Item edit remain hidden rather than becoming a third semantic-content row. Common Studio has
no Narrative slot or Narrative-shaped fallback; a beat or shot package can contribute its own two
or more lanes without changing Studio.

Package-declared primary Instant outputs share one read-only locator row. Their owning Surface
Companions select the exact output ports; common Studio resolves the absolute time values. Windows
remain available for authoring, Inspector references and Track/Item time editing; their consumed
intervals are displayed by the corresponding Track Items rather than repeated in the common row.
Automatically derived Window boundaries and internal helpers are not added as locators.
The resulting time header is one ruler row, the lanes contributed
by each exact Projection, and one common declaration row. They share one Hypit-logo `Timeline`
label and stay pinned as a group while component Tracks scroll. Script's two rows and the common
declaration row are each 15px high; with one Projection they form a compact three-row strip beneath
the 22px ruler. Additional Projections contribute rows, not separate left-hand headers.

Each declaration Companion requests its exact logical outputs for the locator row, including
Instants that no Track consumes. After the Film display execution resolves, Studio evaluates those
additional outputs through the same Compiler and display Executor. Already resolved logical outputs
are reused as in-memory Run Candidates from that exact compilation; the user's Run and its targets
are unchanged. The Runtime's existing transient-execution permissions still apply: displaying a
locator does not submit a Build or enable generation Endpoints. Unresolved or failed locator work
is reported in the Studio terminal without invalidating the Film preview. Only resolved Instants
on the displayed Timeline are shown.

Domain items retain Companion projection order within each lane. Their fine borders distinguish
adjacent and overlapping intervals without inventing time gaps. Selection raises an object above
its peers; playback highlighting changes color without changing that order. Right-click an overlap
to choose a covered object. These are editor presentation rules, independent of Film paint order.

Open the URL printed by Vite. Studio requests port 5179 by default, accepts `--port`,
and Vite can choose another available port when it is occupied. Reuse that process
for edits to the same Run. The Run and loaded Author/Recipe files are watched and
recompiled together. Domain packages, Companion registry, Runtime and Result library
are opened at startup; restart this Studio process after changing those selections,
package code or imports that introduce new packages. Browser refresh does not reload
server-side package modules.

Source watching uses the filesystem Workspace's absolute Source paths. Non-file identities are not
resolved relative to Studio's working directory. Each successful Source compilation replaces the
watched dependency set; removed imports stop triggering updates, and unused directory watchers close.
A failed compilation retains the previous watch set so edits to its known files can still trigger a
new compilation. Directory watching also handles editors that save by replacing the original file.

If opening or maintaining a Source watcher fails, Studio reports the directory, cause and preview
impact in the terminal. It does not poll or automatically retry the failed watcher. Restart Studio
after correcting the underlying filesystem/resource problem; a browser refresh alone may still read
the last compiled snapshot. Studio's own edit requests explicitly recompile and do not depend on
filesystem notifications.

The Source pane can edit the selected `.svml`, `.svs` or `.svrun` file. The Inspector
shows project facts when no Item is selected and declared facts and author fields for
the selected Item. A reference can resolve to a shared Frame or Recipe, so one edit
may affect several consumers. Structured fields save together when editing ends and the value is complete; missing required values stay in the editor with a completion hint.
Check save status; source conflicts reject stale edits rather than overwrite newer files.

Temporal-domain source ranges come from their package Companion. For Script, marker edits use its
parsed anchors and preserve unrelated prose, whitespace and word attributes; the displayed timeline
words are not a replacement text source. Recipe parameter reads use the same Source Header preparation
as compilation, preserving UTF-16 offsets for the exact property being edited.

The Timeline owns the editor's complete range; displayed objects do not extend it. Placed media and
their complete extents are reference information in Studio.

Timeline gestures use explicit temporal authority. Moving a shared Selection or
Moment edits Script and moves its consumers after recompilation. A parameter-based
handle edits its exact authored parameter. Fixed or derived values with no supported
inverse remain read-only. Seeing an Item does not promise every drag gesture.

A direct `during={selection}` move is available only where both semantic endpoints can move by the
same absolute frame delta, so a move always preserves the Window duration. Trimming one edge keeps
the opposite absolute edge fixed. For example, trimming the leading edge of `at/for` atomically
changes the event and duration; trimming the trailing edge of `until/for` does the corresponding
two-source edit. If the executed author relations cannot satisfy the whole gesture, it stays read-only.
An Instant reference expression edits only its offset; a bare reference has an implicit zero offset.
`start/end` trims edit the corresponding expression; moving the window shifts both by the same
frame delta. Edited clock values and offsets are written in frames at the current Timeline rate.
The domain-item Inspector exposes exact anchor identities and, where a declared handle supports it,
offers choices among coincident anchors. Their meaning and writeback remain package-owned.
Dragging to a new frame with several distinct valid Anchor identities does not silently select one;
the author must make that identity choice explicitly.
See [temporal author forms](../temporal/EDITING.md) for the complete behavior.

Tasks and Artifacts are inspection surfaces; selecting an Artifact does not write a
Run Candidate. Use `build-record`/`satisfy` in the Run for explicit Output reuse.

## Component presentation

[Inspector fields](INSPECTOR.md) describes Where/When/How grouping, numeric unit conversion,
rich choices, fonts, color suggestions and exact Source writeback.

The common author surface is `Track -> Item`. `Item` is only Studio's shared selection and
presentation envelope: Visual and Audio packages retain their own Clip models, Typography retains
its occurrence model, and project components retain their own domain names. Their Companions decide
which domain objects become Items and declare each Item's title, interval, layers, Inspector facts,
bindings and temporal lineage. Studio does not enumerate those domain families.

Studio is an application boundary. Core and domain computation do not import it or
register UI metadata. The installed Distribution explicitly selects one independent
Studio Companion per supported official domain. Packages actually selected by the
current Source closure may contribute their own Companion facet. The application
assembles both sets into one immutable registry for that session; there is no second
Studio profile, package scan or replacement map.

Project packages live at `<project>/packages/<package-basename>/`. Neither the
project nor its packages are added to the Hypit Distribution or contributor workspace.
The Host protects exact packages physically embedded in the read-only tool Distribution.
Other selected packages, including independently released official `@hypit/*` extensions,
resolve from the project first and use the Distribution installation only as a fallback.
External Companions compile against `@hypit/studio-companion` and the other public `@hypit/hypit/*`
subpaths, with `@hypit/hypit` as a development dependency. The active Distribution supplies those APIs
at runtime. Ship the Companion's compiled JavaScript with its component package.

The companion owns what its Track means: matching, required same-Surface values,
Items, lane range, finite chrome, title and ordered text/material layers,
source bindings, Inspector fields and executed temporal lineage. Inspector fields
select real bindings or package-owned facts and organize them under the Studio-owned
`Where / When / How` domains, optional companion-owned pages and sections. A
source binding is never shown merely because Studio can reach it. Material layers carry a
Resource id or Surface identity, never a Studio HTTP URL. Studio owns time formatting and transport resolution. Compact chrome shows one primary label;
computed time remains available in its tooltip rather than competing with that label.
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
endpoint's author authority and direct consumer edge. Common Temporal relations are handled by the
shared planner; author packages contribute inverses for their own private construction Producers.
Studio recursively composes those local relations, merges graph paths that produce the same exact
author writes and applies only one distinct conflict-free author plan. The graph reader uses the
same package-owned relations to reconstruct lineage; it does not recognize concrete Temporal or
domain Producer names.
Track Companions never infer semantic sources from SVML attribute names, runtime id prefixes or
coincident frame spans.

Temporal writes remain one Source transaction. After recompilation, Studio checks the rebuilt Item
against the complete requested absolute-frame constraint; a compiling plan that resolves elsewhere
is rejected and the original files are restored just like a compilation failure.

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
full target closure and sends the resulting HTML renderer document to the chosen
render Endpoint. A separate review Run is useful only when the author wants a
different Candidate selection. Its path and filename carry no execution
semantics.

Read [`@hypit/studio-companion`](../studio-companion/README.md) for the Companion ABI,
project activation example, value projection and Inspector declarations.

## Composition audio preview

The preview consumes generic AudioClips: source sampling, fixed gain, program-sample gain envelopes,
audibility regions and target-relative fades. Web Audio gain nodes schedule the independent factors
on the same clock, including silence and amplification above unity. Visual video elements stay muted;
the Film's selected AudioTracks own composition sound. Seeking is silent. This path is independent of
which component emitted an audio contribution.

### Interface language

The globe menu to the left of **Studio / Comments** selects a language. English
and Simplified Chinese are included; additional JSON language packs can be loaded
with `--locale-pack`, from local files or installed package exports. The first
visit follows browser preferences, and later visits remember the user's choice.
Switching preserves the playhead, selection and comment draft.

[Localizing Studio](LOCALIZATION.md) explains the message catalog, plural forms,
translation checks and language-pack distribution. Only Studio-owned interface
text is translated; Companion labels, project content and raw diagnostics retain
their original text. The Companion ABI is unchanged.
