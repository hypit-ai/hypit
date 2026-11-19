# Jensen ranking

Current Hypit Project for the 58.208333-second, 720×1280, 24 fps Jensen ranking edit. `film.svml` is the accepted
NLE Project. Project packages supply the ranking, title, flash, caption and effect implementations. Delivery produces
`deliveries/ranking-jensen.mp4`; the resulting resource may subsequently be accepted by the Project Media Service.

The local `media/` collection and deliveries are working data and are not committed.

## Import this cut from TSX

After building the repository packages, run these commands from this example directory:

```sh
pnpm install
pnpm import:composition
HYPIT_DELIVERY_NAME=ranking-jensen-from-source.mp4 node deliver.mjs film.from-source.svml
```

[`authors/main.tsx`](authors/main.tsx) is the Composition Source for the full edit. It places the five A-roll takes
using their accepted Media durations; projects named source-local speech anchors onto those placements; and uses
the same reveal point for the tier board, sound and flash. It assembles the B-roll groups, both cross-dissolves,
background music, title, and individually editable caption cues. The existing package components own their renders.

[`authors/speech.ts`](authors/speech.ts) holds the accepted timing edition: named speech landmarks in each selected
take and the display words and timing units of its cues. [`authors/broll.ts`](authors/broll.ts) maps those names to media
choices, layouts, and motion. No generation or transcription runs during import. Changing which source take to use
requires matching its speech timing edition to that take first.

The importer resolves the already accepted Project Media, runs the TSX once and creates a new sibling
`film.from-source.svml`. It refuses to overwrite a file at that path. It never reads or changes the checked-in
`film.svml`. Open the new SVML in Studio with `hypit nle open film.from-source.svml`; it is an ordinary editable
NLE Project independent of the TSX. The output is ignored by Git so it can be regenerated or moved aside.

The ranking title is an `@hypit/text-fine#fine` Item with two editable text runs and an explicit line break.
Its Picture layout places the banner on the canvas. Its text parameters set the font, spacing, fill and panel background.
The title and the shared caption style each declare an ordered `typography.fonts` stack. Both reference the project's
installed Montserrat, with system families in the positions each design calls for. Edit a source in the Item Inspector
or set the fallback order in SVML.

Run `node deliver.mjs` after accepting the 41 referenced Media Assets. The script opens the current ProjectHost,
compiles the accepted `film.svml` snapshot to Picture and Audio programs, submits a Delivery Action to the local HTML
Video Executor and observes it to completion.

The selected `@hypit/picture-effects` package supplies finite Inspector sections for Frame, Transform and Filter.
Transform and Filter parameter edits replace their closed values through NLE transactions. All three support generic
trim and split. On the B-roll clip `zero-updates`, Transform is aligned to the start for 1/4 second and Filter is
aligned to the end for 1/6 second. Select Filter in the Inspector to expose its clip-local handle.
Dragging that handle changes the fade duration. Trimming the clip's right edge moves the fade with it.

Fine Caption cues can be trimmed and split in Studio. Their timing units stay in the original cue's source clock,
while each visible Item has its own entrance and exit. The left edge can extend to cue time zero. The right edge
can extend past the final timing unit, leaving the caption visible until the Item's exit.

Caption layout follows the authored order of timing units. Playback orders them by exact source start time.
In `current` mode a later start takes over the highlight, underline and active box. The current emphasis ends
when that unit ends or the next one starts, whichever comes first. Units on the same source frame hand off
according to exact start time, with later display order taking precedence when their starts are equal. `trail`
accumulates units as they start. A point unit with equal start and end occupies its containing source frame.

Studio's Effects bin offers Transform and Filter for a selected Picture Present, and Gain for a selected Audio
Present. The Inspector enables, reorders and removes occurrences of these effects. Gain exposes its constant value
or the values of existing linear envelope points. Preview and Delivery consume the edited Process chain.

`@hypit/caption-fine` projects stable word and timing collections plus its inline/shared typography slot. Word text,
exact rational unit edges and typography fields reduce to replacement closed values in the backend. The ranking package projects stable
tier and entry collections and accepts semantic label and tier edits. Studio offers a starter Tier board and
projects a required still-Picture slot for each entry. Bind an accepted still in the Inspector or supply
`subject.first` as a Media seed when materializing the starter through the Product Session.

Local delivery resolves `ffmpeg` and `ffprobe` from the Host `PATH`. Set `HYPIT_FFMPEG_PATH` and
`HYPIT_FFPROBE_PATH` to select explicit executables; `HYPIT_ELECTRON_PATH` selects Electron instead of Chromium.
