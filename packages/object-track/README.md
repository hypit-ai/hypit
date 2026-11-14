# `@hypit/object-track`

File-first, editable object tracks attached to a Media Asset.

An `hypit.object-track@1` document contains named tracks and exact-time samples in normalized media
display space. A sample is either one direct rectangle or `null`; there is no confidence,
authority, analyzer identity, smoothing policy or Timeline coordinate. The Media Asset
Representation binding maps the document's local domain to media time and declares the picture
space.

The package owns the `@hypit/object-track#ObjectTrackDocument` Representation reader. It checks
that the opened document domain is exactly the temporal binding target and that the representation
is bound to media display coordinates. Importing or opening the file never runs detection or
tracking.

Analyzers such as SAM, a person tracker or a hand-authored overlay may all publish this same file
shape. Dense masks, depth and camera motion should remain separately typed Representation packages;
they can reference their own files through the Media Asset `resources` map instead of adding fields
to Object Track or Media Asset Core.
