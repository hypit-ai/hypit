# Studio confirmation and paid-build handoff

This is the human handoff around both the reconstruction and original-authoring routes. It is not a
VLM review and it does not replace the route's mechanical checks.

## Before the paid gate

After the route-specific final check passes, but before submitting any paid Build:

1. Start Hypit Studio for the current `build.svrun` and give the author its URL.
2. Let Studio show the complete program through the normal SVRun-native preview path:
   `compiler-node Graph → preview-mock → mock-media → temporary preview.svrun → Studio`.
3. Tell the author this is an estimate-timed, preview-only mock and ask whether the structure and
   intended result are acceptable for paid generation.
4. Do not submit `hypit build` until the author explicitly accepts and confirms the cost.

If the author does not accept, do not Build. Capture the requested change and enter `revision.md`.
Revision edits Source/Recipe/Run and reruns deterministic gates; it does not ask an agent or VLM to
judge the picture.

## After the paid Build

Once the author has accepted and the paid Build is submitted/accepted, start Studio for the same Run
to show the complete program using the accepted material. Start the HyperFrames/final render at the
same time; the render must not wait for the author to finish looking at Studio. Studio is a live,
read-only presentation of the current Run while the render proceeds. Report render/build status and
the Studio URL independently.

## After a revision

When a user-requested revision completes its deterministic gates, preserve a running Studio session
and let its file watcher hot-reload the updated SVML/SVS/SVRun. If the current Run has no Studio
session, start one for that Run and give the author the URL so they can see the change. Do not invoke a
VLM, comparison, observer or visual judgement as part of Revision. Do not restart an already-running
Studio merely because Source changed. If the startup parameters change (for example a different Run,
workspace or port), stop the previous Studio first so the new server cannot collide with its port.

Use the existing `preview.md` startup command and `revision_state` snapshot. Studio startup is a
display handoff, not permission to Build; a new paid generation still requires a fresh cost
confirmation.
