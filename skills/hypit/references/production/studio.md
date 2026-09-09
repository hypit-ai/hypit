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
| Tasks | Finished project Results and, with a selected Runtime, read-only active Build/Operation information. This is a view of execution, not a replacement Build submission mechanism. |
| Artifacts | Public media files from project Results, including files inside Composite Outputs. Previewing one does not select it as a Candidate in the Run. |

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

Dragging a Selection boundary or Moment changes that identity in Script. Every Track consuming it
then follows the changed semantic relation. A clock-based handle instead changes its declared time
parameter. Use the displayed handles and their actual authority; a visible item is not automatically
independently draggable. A derived or fixed value without a supported inverse may be read-only.
Do not replace a semantic relation with guessed seconds just to make a rectangle move.

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
