# Jensen ranking

Current Hypit Project for the 58.208333-second, 720×1280, 24 fps Jensen ranking edit. `film.svml` is the accepted
NLE Project. Project packages supply the ranking, title, flash, caption and effect implementations. Delivery produces
`deliveries/ranking-jensen.mp4`; the resulting resource may subsequently be accepted by the Project Media Service.

The local `media/` collection and deliveries are working data and are not committed.

Run `node deliver.mjs` after accepting the 41 referenced Media Assets. The script opens the current ProjectHost,
closes the accepted `film.svml` snapshot as AVIR and terminal programs, submits a Delivery Action to the local HTML
Video Executor and observes it to completion.
The accepted SVML lowers to 99 AVIR Occurrences, 579 Picture nodes and 42 Audio nodes.

The selected `@hypit/picture-effects` package also proves bounded editing facets. Its Frame, Transform and Filter
Operators project finite Inspector sections; Transform and Filter semantic operations replace only their closed
parameters through ordinary NLE transactions. All three declare that generic trim and split preserve their current
meaning by slicing the existing Control relation. Their product facets are finite projections, reducers and temporal
declarations selected through the package symbol.

`@hypit/caption-fine` projects stable word and timing collections plus its inline/shared typography slot. Word text,
exact rational unit edges and typography fields reduce to replacement closed values in the backend; the package does not
yet declare generic trim/split safe, so those affordances remain unavailable. The ranking package projects stable
tier and entry collections and accepts semantic label and tier edits. Studio offers a starter Tier board and
projects a required still-Picture slot for each entry. Bind an accepted still in the Inspector or supply
`subject.first` as a Media seed when materializing the starter through the Product Session.

Local delivery resolves `ffmpeg` and `ffprobe` from the Host `PATH`. Set `HYPIT_FFMPEG_PATH` and
`HYPIT_FFPROBE_PATH` to select explicit executables; `HYPIT_ELECTRON_PATH` selects Electron instead of Chromium.
