# `@svml/media`

Author-facing media declarations for the neutral `@svml/media` contract module.

`<media:Image>` and `<media:Audio>` request bytes through the Host-owned source-asset capability and
emit one content-addressed `BlobArtifact`. They do not open files themselves, inspect media, call a
Provider or promote declared audio to speech. The consuming author package decides whether an audio
artifact is a voice reference, soundtrack, evidence source or something else.
