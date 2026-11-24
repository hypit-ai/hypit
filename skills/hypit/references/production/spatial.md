# Spatial Canvas and Picture Layout

Every `<composition>` defines its unit-neutral Picture canvas via positive `width` and `height`
(for example `width="1920" height="1080"` for 16:9 or `width="1080" height="1920"` for 9:16).

## `<layout>` on Picture Presents

Every Picture Present places its visual inside `<picture>` using `<layout>`:

```xml
<picture>
  <layout x="0" y="0" width="1920" height="1080" fit="cover" content-x="0.5" content-y="0.5" />
</picture>
```

- `x`, `y`: top-left origin in Composition canvas coordinates.
- `width`, `height`: target frame dimensions on the canvas.
- `fit`: `fill` (stretch to bounds), `contain` (letterbox inside bounds), or `cover` (fill bounds
  while cropping overflow).
- `content-x`, `content-y` *(optional)*: normalized focal anchor (`0` to `1`, default `0.5`) used
  when `cover` crops or `contain` aligns inside the frame.
- Shared layout: `<layout ref="<shared-value-id>" />` references a Project `<shared-value>` owned
  by layout so multiple Presents share exact framing.

Post-layout transforms (scale, rotation, translation, opacity, color grading, border/crop) are
authored as ordered `<process>` Operators inside `<picture>`.
