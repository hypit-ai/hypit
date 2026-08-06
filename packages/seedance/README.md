# `@svml/seedance`

Exact Seedance author model module. It owns the request schema and the namespaced `Prompt`, `Video`
and `Speech` Surfaces; it does not contain KIE credentials, HTTP code, queues or runtime routing.

`Video` and `Speech` preserve the remote result as one atomic `GeneratedVideoSet`, then expose its
first ordered member through the shared deterministic primary-video projection. `Speech` consumes a
shared `NarrativeExcerpt`, so a third-party narrative Surface can feed it without importing the
official Script parser.

Duration is explicit in this low-level model Surface. A later Speech scheduling package may wrap it
with estimation without changing Core or the exact Seedance/KIE contracts.
