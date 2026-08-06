# `@svml/media`

Author-facing media declarations for the neutral `@svml/media` contract module.

`<media:Image>` requests bytes through the Host-owned source-asset capability and emits one
content-addressed `BlobArtifact`. It does not open files itself, inspect media, call a Provider or
promote an embedded audio stream to speech.
