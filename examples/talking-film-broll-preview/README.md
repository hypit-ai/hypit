# talking-film-broll-preview

A vertical talking film with two B-roll inserts on one Media Track, written so
that a placement mistake is visible by eye.

## What it demonstrates

**Two inserts, one Track.** `@claim` and `@proof` are disjoint Selections, so
`broll-one` and `broll-two` share a single timeline row the way an editor would
lay them out.

**Placement you can check by eye.** `card-a` and `card-b` differ in every
dimension, so a coordinate mistake is visible rather than accidentally correct.

**Frame versus content box.** `media.card` is rounded and padded; `media.wide` is
flush with a border. Studio draws the Placement Frame and the painted content box
separately, and only the first Item has an inset.

**Motion.** `motion.card` slides in and fades out, so the box moves across the
first frames of `broll-one` and holds still for `broll-two`, which declares none.

## Frame edges

`<space:Frame>` takes `right` and `bottom` as absolute edge positions, not
insets. `card-a` spans `left="8%"` to `right="92%"` — 86.4px to 993.6px of a
1080px canvas.

## Building it

The Source is complete, so it builds like any other example once a Runtime
Profile and credentials are in place.

Studio opens a Run, so seeing this one means writing a `.svrun` that satisfies
its generated outputs; see `docs/quickstart/preview.md`.
