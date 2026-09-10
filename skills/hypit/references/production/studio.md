# Working in Studio and adding a Companion

Read this when opening a Run, using its timeline and Inspector, or giving a project component a
useful Studio presentation. [Review](review.md) owns the judgment made from the visible work;
[Track authoring](track-authoring.md) owns the component's production behavior.

## Open the actual Run

From the video project, use the installed Distribution's command:

```bash
hypit studio --run build.svrun
```

Supply `--runtime <profile>` when intentionally using a different Profile from the project's
`hypit runtime use` selection. Studio needs a Run whose selected targets reach one Film with resolved
composition and time. Speech-led work includes a Script lane; a pure animation's ProgramSpace supplies
the clock for its component lanes. An image-generation-only Run is not a Film view; several distinct
Films need separate Runs or sessions.

Open the URL actually printed by the process and retain it with the Run it serves. The default
requested port is 5179; `--port` selects another, and an occupied port can cause Vite to choose a
different one. Reuse an existing session when it serves the intended project and Run.

The startup output identifies the project, absolute Run path, Runtime Profile and selection source.
An explicit `--runtime` applies to this session; the project's default comes from `.hypit/runtime`.
When launching from another directory, use `--workspace` to select the project and supply the Run
path from the current directory, as shown in [project boundaries](../creation/project-files.md#establish-the-project-boundary).

Studio watches the Run and its loaded Author/Recipe Sources and recompiles them after changes.
Changing package code, adding a package import, changing Companion activation, or selecting another
Runtime or Result repository requires restarting that Studio session: those implementations and
selections are loaded at startup. A browser refresh alone does not reload the server-side modules.
Stop only the relevant Studio process; stopping Studio does not cancel a submitted Build.

## Show the finished work

Alongside the delivered video, a brief look at its editable production can make the handoff more
tangible. When Studio is readily accessible to the user, open the finished work and share the session
URL. Use a Run that reuses the completed media and SemanticTakes while keeping its Tracks and Recipes
available for editing. Reuse a suitable existing session or launch one as described above.

Point out something specific to this piece: a reveal tied to a word, the Caption styling, or a
component parameter they can adjust. Let the actual work demonstrate the editing experience. For a
remote user, a readily available screenshot or short recording can provide the same introduction.
[Project handoff](../creation/project-files.md#hand-over-an-editable-production) explains what to
include when the user wants to continue editing on another machine.

## Read the different views

| View | What it shows and what it can change |
| --- | --- |
| Source | The exact Run, Author and imported Source/Recipe files. Select a file and use Edit source; changes save automatically, and Cmd/Ctrl+S saves immediately. Check save/error state. This is not a project filesystem browser. |
| Preview | The selected Film composition rendered by HyperFrames in the browser. Play or seek to inspect the actual selected media and graphics. |
| Timeline | Semantic Segments, Selections and Moments, plus the component-projected Track entities and their visible intervals, materials or event lanes. A rectangle may describe occupancy, activation or persistent visibility; read the component's meaning. |
| Inspector | With nothing selected, project, Canvas, time and Run facts. For a selected entity, only its declared adjustable fields, organized under Where, How and When where applicable. |
| Tasks | One card per Build, grouped into ongoing and finished. Active status and progress come from the selected Runtime; completed, failed and cancelled Builds come from project Results. Cards retain the source Run, times and any failure or attention reason. |
| Artifacts | Image, video and audio file Outputs from project Results, including those already published by ongoing Builds. Use the sidebar to choose all media, videos, images or audio. View media on a Build opens its Outputs; opening the Artifacts tab returns to project media. Composite Outputs such as normalized media and Semantic Takes stay intact and do not add their internal files to this gallery. Click a card to view it in the central preview; video and audio have playback and a time slider. Back to composition returns to the existing composition position. Previewing a file does not select it as a Candidate in the Run. |

Open either library tab or click Refresh to read its latest state. These lists do not poll.
Refresh replaces the view; scrolling to the end loads more. Media categories query matching files
across Result pages, so an intervening Build without that kind of media does not require a separate action. A failed refresh keeps the
previous view and displays the error. Multiple references to one stored file share a media card;
its source details retain the originating Builds and Outputs. Highlighted Outputs appear first.
Names show up to two lines. Double-click a name or press F2 to edit; Enter or leaving the field
saves, and Escape cancels. Renaming changes the displayed Output name in the finished Result,
not its reference identifier or media file.

Use [Builds and Results](builds.md) to inspect Output names, export media, finish an incomplete Result,
edit Result presentation metadata or select an earlier Output. Studio reads the same project Result
repository. With no Runtime selected, finished Results remain accessible; preview works when its
display closure needs no unresolved Endpoint work. Active Runtime status and transient Endpoint
processing require the selected environment.

Studio opens the selected work for interactive playback and editing. It creates no Build and submits
no paid generation. It can evaluate deterministic Producers and the exact immediate capabilities a
Provider permits for transient authoring, such as media inspection and normalization. Select existing
files or produced Outputs through the Run for the material the view needs. If a required generation
is still running, continue component work and open its resulting composition when the material is ready.

[Runs](runs.md) explains selection and reuse. [Rendering](rendering.md) provides frame-range Builds
for inspecting the composition as encoded media; choose the view that helps answer the current question.

## Edit the owning Source fact

Inspector fields and timeline handles write back to actual Source endpoints. A field can live in a
referenced Frame, Style or SVS Recipe rather than on the selected Track tag. Editing a shared Recipe
changes every consumer that uses it; create and select a separate authored instance when the design
needs independent variation. Lists and records have a local draft with Apply and Reset; Apply writes
the complete validated value. Check save status and the resulting preview.

Where groups position, size, fitting and layout. When groups timing, playback, trims and motion.
How groups content, typography, color, effects and audio levels. Components name their own pages
and sections within these questions. Numeric units sit outside the editable value: a width authored
as `78%` keeps `%` when edited, while a fractional opacity may display as a percentage and write
back as a fraction. Dropdowns can have readable option names and previews; their underlying value
is what the Source receives. Color fields support exact hex values and suggested swatches.

For catalog fonts, Caption, Typography and Ranking can expose the primary font family's dropdown
through the selected Style. It edits the shared font declaration; its weight and style must be
available in the chosen family. A local font continues to use its exact file. A project component
can offer its own font or preset choices through Companion fields.

Dragging a direct Selection or Moment changes that identity in Script. Every Track consuming it
then follows the changed relation. The authored time form determines what the gesture changes:

| Time form | Timeline editing |
| --- | --- |
| `during={story.selection.proof}` | Move both boundaries by the same number of semantic stops; the duration can change. Trim either boundary independently. |
| `at={story.moment.reveal} for="8f"` | Move the Moment, or trim the trailing edge to change the duration. |
| `until={story.moment.reveal} for="8f"` | Move the Moment, or trim the leading edge to change the duration. |
| `at="2s" for="8f"` | Move the clock position, or trim the trailing duration; `until/for` works conversely. |
| `instant="moment.cue"` or `instant="moment.cue + 2f"` with a bound Moment | Move the local offset while retaining the Moment; an omitted offset starts at zero. |
| `start="..." end="..."` | Trim one endpoint's time expression, or move both by the same frame delta. Referenced Script markers stay in place. |

A semantic stop is a distinct frame position occupied by word or structural boundaries. Select a
semantic marker to see its exact anchors; when several share a frame, the Inspector offers the
choices supported by its editable consumers. Direct Segment/Program spans follow their structural
boundaries without timeline dragging. Components declare their own handles and writable fields.

Clock-based dragging writes the changed value or offset in whole frames at the current frame rate.
Unedited expressions retain their units: `2s` keeps its duration across frame-rate changes, while
`60f` keeps its frame count. Direct semantic dragging changes the Script anchors instead.

Source edits outside Studio are observed too. If a stale UI edit conflicts with a newer file, read
the current Source and retry the intended change against it instead of overwriting the newer work.
All successful edits return to the ordinary Sources; they do not create a second Studio project.

## Give a project component a useful Companion

The component's Producers own its rendered video. A **Studio Companion** explains that component to
the editor: which output it understands, what its timeline entities mean, which materials to show,
which authored parameters to expose and how an edit relates back to Source.

Generic VisualTrack and AudioTrack presentation already exists. Add a Companion when it makes the
new role legible or editable: for example, a score board's outer lifetime and per-score activations,
or a Caption family's Cue text and actual per-Cue Style. A static vocabulary preview helps recognize
a component; it does not supply these live entities or edit bindings.

Keep Companion code separate from domain computation and contribute its Host facet from the
Source-selected project package's activation. The Distribution supplies official Companions; a
project package can supply its own without editing Studio or adding a Studio Profile. Installing an
otherwise unselected package does not activate a plugin. The installed `@hypit/studio-adapter`
README gives the exact ABI, a minimal Companion and the activation wiring.

An external Companion imports `@hypit/hypit/studio-adapter` and the relevant public `@hypit/hypit/*` domain APIs,
with `@hypit/hypit` as a development dependency. Ship the compiled Companion with the component. Its
Source-selected activation contributes the editor facet alongside the component's existing facets.

Expose meaningful deterministic schedule/program outputs when the Companion needs more than the
terminal Track. Ask for exact same-Surface output ports through `requiredValues`, or follow one
exact typed authored reference. Preserve child identities and consume the real Window/Instant graph
edges so Studio can trace temporal authority. Never infer a Moment from matching frame numbers,
an id prefix or a parsed attribute name.

Declare Source bindings separately from visible Inspector fields. Offer the parameters useful to
this production, including explicit reference paths into Recipes. The Companion selects finite
presentation and controls; Studio owns DOM, CSS, validation and Source writes. A Companion does not
need its own filesystem mutation, Provider calls or rendering loop.

For implementation patterns, read the installed `@hypit/ranking-studio` for persistent state and
activation lanes, `@hypit/caption-fine-studio` for Cue/Style relationships, or
`@hypit/media-track-studio` for media occupancy. Verify the new component in an ordinary Run:
select the intended entity, adjust one exposed value, inspect the exact Source change and seek to
the affected frames. For shared semantic timing, also inspect the other consumers of that marker.
