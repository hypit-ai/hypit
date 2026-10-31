# @hypit/nle

Editing documents, structured commands and Author projection for a non-linear editor.

A `hypit.nle@1` document owns its media bin, timeline placements and canvas. Media entries retain
original URIs. A clip refers to a media entry and records its timeline start, duration and source
in-point in the project's rational frame rate. Visual tracks are stored in back-to-front paint order.

`applyTransaction(document, { revision, commands })` returns a new revision after applying the whole
command list. A mismatched revision is rejected. The Host owns file access, media inspection,
serialization, user history and coordination with external edits. During a gesture, the editor
updates a temporary view; pointer release submits one transaction.

`projectAuthor` produces an Author tree for the current edit. The Host supplies asset locators.
`printAuthor` serializes that owned tree to SVML. `appearanceSource` supplies the accompanying Film
appearance. Material placed on the timeline becomes ordinary Media, Prepare, Window, VisualTrack,
AudioTrack and Film declarations. A video clip includes its embedded audio when `audio` is enabled.
The export target is `final.video`.

Local-file Hosts should resolve the project directory and media paths before calculating relative
asset locators, then grant access to the referenced media roots. The persisted project retains the
original URI so moved or missing files can be reported and relinked.
