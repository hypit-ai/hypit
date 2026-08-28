# Studio confirmation and paid-build handoff

This is the human handoff around both the reconstruction and original-authoring routes. It is not a
VLM review and it does not replace the route's mechanical checks.

## Before the paid gate

After the route-specific final check passes, but before submitting any paid Build:

1. Run `realizePreviewMock({ run: "<project>/build.svrun", timing: "estimate" })`. It writes a
   durable `.hypit/preview/<digest>/mock.svrun` (the native mock materialization Run), its
   content-addressed Artifacts, and a second `preview.svrun` whose relative file Candidates point
   at those results.
2. Start Hypit Studio with that returned `previewRun` path. Capture the URL printed by
   `server.printUrls()` and give the author the exact URL (for example,
   `http://localhost:5179/`) in the handoff. Studio can
   therefore be started as a separate process and reopen the same bytes; it does not depend on an
   in-memory attachment list or a mock-media endpoint (Studio may use the local FFmpeg endpoint for
   deterministic inspect/normalize operations).
3. Let Studio show the complete program through the normal SVRun-native preview path:
   `compiler-node Graph → mock.svrun/mock-media → persisted Artifacts → preview.svrun → Studio`.
4. Tell the author this is an estimate-timed, preview-only mock and ask whether the structure and
   intended result are acceptable for paid generation.
5. Do not submit `hypit build` until the author explicitly accepts and confirms the cost.

If the author does not accept, do not Build. Capture the requested change and enter `revision/route.md`.
Revision edits Source/Recipe/Run and reruns deterministic gates; it does not ask an agent or VLM to
judge the picture.

## After the paid Build

Once the author has accepted and the paid Build is submitted/accepted, create/persist a derived Run
that selects the accepted Build Records (the same `<build-record>`/`<satisfy>` mechanism documented in
`runtime.md`), then start Studio for that accepted-material Run. Start the HyperFrames/final render at
the same time; the render must not wait for the author to finish looking at Studio. Studio is a live,
read-only presentation of the current Run while the render proceeds. Report render/build status and
the Studio URL independently.

After that full video is delivered, any new natural-language change is routed to
`revision_state start --run <accepted-material-run>` and `revision/route.md`. It is not a second visual
review loop and it never edits the rendered artifact; the revision updates Source/Recipe/Run and
reruns only the deterministic gates before the next Studio handoff or paid Build confirmation.

## After a revision

When a user-requested revision completes its deterministic gates, preserve a running Studio session
and let its file watcher hot-reload the updated SVML/SVS/SVRun. If the current Run has no Studio
session, start one for that Run, capture the URL printed by the server, and give the author the exact
URL so they can see the change. Do not invoke a
VLM, comparison, observer or visual judgement as part of Revision. Do not restart an already-running
Studio merely because Source changed. If the startup parameters change (for example a different Run,
workspace or port), stop the previous Studio first so the new server cannot collide with its port.

Use the existing `preview.md` startup command and `revision_state` snapshot. Studio startup is a
display handoff, not permission to Build; a new paid generation still requires a fresh cost
confirmation.
