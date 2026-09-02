# Studio confirmation and paid-build handoff

This is the human handoff around both the reconstruction and original-authoring routes. It is not a
VLM review and it does not replace the route's mechanical checks.

## Before the paid gate

After the route-specific final check passes, but before submitting any paid Build:

0. Read the selected Runtime Profile and preflight result and tell the author which Provider and
   credential source will be used for every paid capability (for example, KIE + `KIE_API_KEY`, or
   HypiHub OAuth from the OS store). Never display the secret. Credentials must already be usable from
   environment setup; if one is missing or cannot reach the requested model, stop and return to that gate.

1. Realize the preview through the native `reference-video-tools render_element` path (or the
   repository API `realizePreviewMock({ run: "<project>/build.svrun", timing: "estimate" })`).
   The tool writes a durable `.hypit/preview/<digest>/mock.svrun` (the native mock materialization
   Run), its content-addressed Artifacts, and a second `preview.svrun` whose relative file Candidates
   point at those results. The realization is keyed by the Author/Run/target/geometry/timing digest,
   so repeating the command reopens the cached bytes instead of generating new media or spending
   Provider quota.
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
`runtime.md`), but never satisfy a Run Target such as `final.video`: Studio needs that Target to remain
connected to the current Film graph, not replaced by an opaque finished-media Candidate. Generate the
markup with `hypit history --source <author.svml> --pin --exclude-targets`, persist it in a separate
Studio Run, then start Studio for that accepted-material Run. The Build Run may retain the narrower set
of paid upstream pins it needs for reuse; neither Run pins its own Target. Start the HyperFrames/final
render at the same time; the render must not wait for the author to finish looking at Studio. Studio is
a live, read-only presentation of the current Run while the render proceeds. Report render/build status
and the Studio URL independently.

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

Use the existing `preview.md` startup command and `revision_state` snapshot. In a contributor
checkout, `hypit-studio` means `node <checkout>/bin/hypit-studio.mjs` and is a standalone entrypoint,
not `hypit studio`. Studio startup is a
display handoff, not permission to Build; a new paid generation still requires a fresh cost
confirmation.
