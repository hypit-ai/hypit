# `@hypit/media-author`

Optional Source/Author declarations for constructing `@hypit/media` values and operation fragments.

The logical `@hypit/media-author@1` module owns only declaration spelling. Its records and operations use
the neutral Types and Producers owned by `@hypit/media@1`, which is loaded as an ordinary module dependency.
NLE projects, Media Assets and direct media execution depend only on `@hypit/media`; they never install this
Source frontend package.
