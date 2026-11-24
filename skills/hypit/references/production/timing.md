# Timing and Exact Rational Time Maps

NLE represents every time value in SVML as an exact rational number of seconds
`numerator/denominator` with a positive integer denominator (for example `0/1`, `3/2`, `24000/1001`).

## Placement on a Track

Every `<present>` and `<adjust>` item declares:
- `start`: exact start time on its Composition's Programme timeline (seconds rational).
- `duration`: positive duration on the Programme timeline (seconds rational).

## `<source-time>` Mapping

Every `<present>` maps its local visible time `[0, duration]` to its source's local time using
ordered, non-overlapping pieces:

```xml
<source-time>
  <linear target-start="0/1" target-end="4/1" source-start="2/1" rate="1/1" />
  <linear target-start="4/1" target-end="6/1" source-start="6/1" rate="0/1" />
</source-time>
```

- `rate="1/1"`: normal 1× playback.
- `rate="0/1"`: freeze/hold at `source-start`.
- `rate="-1/1"`: reverse playback.
- `rate="2/1"`: 2× speed.
- Optional `wrap-start` and `wrap-end` (must be supplied together): loops the source window.
- `<cubic target-start="..." target-end="..." source-start="..." source-control-1="..." source-control-2="..." source-end="..." />`: smooth speed ramp.

## `<control-time>` Mapping for Processes and Adjusts

Each `<process>` or `<adjust>` maps Item-local visible time to the Operator's Control domain using
`<linear>` / `<cubic>` pieces, or edge-aligned shorthand on occurrence-local Processes:

```xml
<control-time edge="end" duration="1/6" control-duration="1/4" />
```

## Projecting Transcript Timestamps in TSX

When materializing SVML from `@hypit/nle/authoring`, use `seconds("1.5")`, `projectSourceInstant`,
and `projectSourceRange` to convert aligned transcript seconds through trimmed or speed-changed
media placements cleanly.
