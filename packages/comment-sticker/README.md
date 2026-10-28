# `@hypit/comment-sticker`

Install in the video project alongside Hypit:

```bash
npm install @hypit/comment-sticker
```

The Track declaration accepts `timeline={program.timeline}`. Each Sticker consumes an already declared
absolute Window; semantic or other domain coordinates are projected upstream.

An author package for timed social-comment cards. It publishes an ordinary `VisualTrack` containing
the cards' independently timed appearances.

The author declaration keeps the three independent concerns visible:

- `SpatialFrame` owns placement and size;
- an SVS Recipe plus an exact `FontStackRef` owns appearance and local motion;
- a named absolute Window owns when an item exists.

```xml
<import as="copy" from="@hypit/text@1"/>

<copy:Value id="comment-copy">This part finally made the idea click.</copy:Value>
<copy:Value id="comment-author">@viewer</copy:Value>

<comment:Style id="social-comment" recipe={styles.comment} font={fonts.ui}/>

<comment:Track id="comments" timeline={speech.timeline}>
  <comment:Sticker
    id="opening-comment"
    comment={comment-copy}
    frame={layout.comment}
    style={social-comment}
    author={comment-author}
    meta="Featured comment"
    during={speech.window}
  />
</comment:Track>
```

Body text remains the compact literal form. `comment`, `author`, `header` and `meta` also accept
ordinary graph `Text` references; `comment={...}` is exclusive with body text. The Fragment builds
one package-owned content value through explicit Text edges before temporal placement. `avatar` is
an independent Artifact edge. Metadata is never fabricated: if `meta` is absent, no metadata row
is rendered. Sound effects remain a separate Audio Track.

The same installed package contributes its Studio Companion. Runtime behavior and editor projection
therefore share one owner and version; there is no separate Studio package to install.
