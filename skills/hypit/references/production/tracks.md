# Tracks, Paint Order, and Edit Groups

Each `<composition>` contains an ordered list of `<track>` elements:

```xml
<track id="picture" name="Picture" kind="picture" role="picture" enabled="true">
  <!-- present or adjust items -->
</track>
```

## Track Kinds and Roles

| `kind` | Allowed `role` values | Allowed Items |
| --- | --- | --- |
| `picture` | `picture`, `text`, `subtitle`, `filter`, `effect` | `present` (on `picture`/`text`/`subtitle`/`effect`), `adjust` (on `filter`/`effect`) |
| `audio` | `audio`, `effect` | `present` (on `audio`/`effect`), `adjust` (on `effect`) |

- `text` and `subtitle` Tracks hold Component Presents (`source="component"`).
- `filter` Tracks hold `<adjust>` items that process the Picture signal accumulated below them.

## Paint Order and Mixing

- Picture Tracks are ordered **bottom-to-top** in SVML document order: later Picture Tracks paint
  over earlier ones. There is no global `z` attribute.
- Overlapping Picture Presents on the same Track paint **back-to-front** in document order.
- Audio Presents mix additively across and within Audio Tracks.

## Transitions, Mattes, and Edit Groups

- `<transition id="..." outgoing="a" incoming="b" package="..." symbol="...">`: gives an overlap
  between two Picture Presents a two-input transition effect.
- `<matte id="..." content="title" matte="shape" package="..." symbol="...">`: applies one Present
  as a matte over another.
- `<group id="..."><member item="a" /><member item="b" /></group>`: binds 2+ Items across Tracks
  so they move together in time.
