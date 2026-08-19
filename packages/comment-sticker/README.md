# `@hypit/comment-sticker`

An optional author package for timed social-comment cards. It lowers every sticker to one ordinary,
self-contained `VisualTrack`; it has no privileged Film behavior and never samples a sibling Track.

The author surface keeps the three independent concerns visible:

- `SpatialFrame` owns placement and size;
- an SVS Recipe plus an exact `FontStackRef` owns appearance and local motion;
- the shared Temporal projection owns when an item exists.

```xml
<import as="copy" from="@hypit/text@1"/>

<copy:Value id="comment-copy">This part finally made the idea click.</copy:Value>
<copy:Value id="comment-author">@viewer</copy:Value>

<comment:Style id="social-comment" recipe={styles.comment} font={fonts.ui}/>

<comment:Track id="comments" canvas={video.canvas} space={video.space}>
  <comment:Sticker
    id="opening-comment"
    comment={comment-copy}
    frame={layout.comment}
    style={social-comment}
    author={comment-author}
    meta="Featured comment"
    during="program"
  />
</comment:Track>
```

Body text remains the compact literal form. `comment`, `author`, `header` and `meta` also accept
ordinary graph `Text` references; `comment={...}` is exclusive with body text. The Fragment builds
one package-owned content value through explicit Text edges before temporal placement. `avatar` is
an independent Artifact edge. Metadata is never fabricated: if `meta` is absent, no metadata row
is rendered. Sound effects remain a separate Audio Track.
