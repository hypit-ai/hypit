# `@narratage/comment-sticker`

An optional author package for timed social-comment cards. It lowers every sticker to one ordinary,
self-contained `VisualTrack`; it has no privileged Film behavior and never samples a sibling Track.

The author surface keeps the three independent concerns visible:

- `SpatialFrame` owns placement and size;
- an SVS Recipe plus an exact `FontStackRef` owns appearance and local motion;
- the shared Temporal projection owns when an item exists.

```xml
<comment:Style id="social-comment" recipe={styles.comment} font={fonts.ui}/>

<comment:Track id="comments" canvas={video.canvas} space={video.space}>
  <comment:Sticker
    id="opening-comment"
    frame={layout.comment}
    style={social-comment}
    author="@viewer"
    meta="Featured comment"
    during="program"
  >
    This part finally made the idea click.
  </comment:Sticker>
</comment:Track>
```

`author`, `avatar`, `header`, and `meta` are optional. Metadata is never fabricated: if `meta` is
absent, no metadata row is rendered. Sound effects remain a separate Audio Track.
