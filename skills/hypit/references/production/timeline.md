# Timeline and Compositions

An SVML document owns one or more `<composition>` definitions and selects one `root` Composition
on `<svml id="..." name="..." root="main" edit-rate="30/1">`.

## Edit Rate and Extent

- `edit-rate` is a positive rational frame grid (default `30/1`; e.g., `24000/1001`, `60/1`) shared
  by all Compositions in the file. Item times remain exact rationals across grid changes; delivery
  (`hypit nle export`) can choose its own output frame rate.
- A Composition's **extent** is `0` or the latest `start + duration` across all Items on its Tracks.
- Disabled Items (`enabled="false"`) and disabled Tracks mute their signal while preserving extent.
- Gaps with no active Picture render the requested delivery background color (default `#000000`).
  Gaps with no active Audio produce silence.

## Nested Compositions

Define reusable sub-timelines as sibling `<composition>` elements and place them with a
Composition Present (`source="composition"` + `<composition ref="intro" />`). Cycles are invalid.
A nested Composition can carry its own Tracks, Transitions, and Mattes and appears as a single
editable Present in the parent timeline.
