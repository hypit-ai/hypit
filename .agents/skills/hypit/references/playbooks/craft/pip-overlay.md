# Picture-in-picture craft

Use picture-in-picture only when the base evidence must remain dominant while a presenter, reaction,
secondary feed, or supporting image stays visible.

## Choose the source form

- Use a normal rectangular `media-track:Item video={...}` for a live reaction, presenter feed, screen
  recording, or secondary camera.
- Use `remove:Background` when a still portrait must become a transparent cutout. Place the resulting
  image with `image={cutout.image}` plus an explicit `space:Extent`.
- Use `compose:Image` with ordered `compose:Layer` children when the PIP should be frozen into one
  deterministic still before it enters the timeline. Cutting out and composing are a chain, not a
  choice between two: when a cutout is what goes into the composite, the cutout's output is the
  layer's source. Reaching for `compose:Image` does not replace removing the background first.
- Use `surface={...}` only when the upstream component already produces an authored compositable
  surface. Keep the source form explicit rather than guessing from a generic Artifact.

```svml
<remove:Background id="presenter-cutout" source={presenter.image}/>
<space:Extent id="presenter-extent" width="1200" height="1600"/>
<space:Frame id="presenter-pip" within={vertical}
  left="64%" top="52%" right="4%" bottom="8%"/>

<media-track:Track id="presenter-overlay" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item image={presenter-cutout.image} extent={presenter-extent}
    frame={presenter-pip} during="program"
    appearance={studio.media.pip} motion={studio.motion.pip}/>
</media-track:Track>
```

## Lock placement and appearance

- Define one stable Frame, fit, crop, border/paint treatment, stack order, and safe margin for a
  persistent PIP. Preserve them across shots unless a deliberate transition changes the layout.
- Keep the PIP clear of captions, faces, product labels, key UI, action buttons, and the base shot's
  main evidence.
- Match source light direction, color temperature, contrast, and apparent camera quality to the base
  closely enough that the composite reads as intentional.
- For transparent cutouts, inspect the actual edges against the final base: hair, fingers, motion
  blur, holes, residual background, halos, and color spill.
- Scale tall portraits against both width and resulting height. A narrow cutout can still consume most
  of a vertical frame.

## Keep speech and motion truthful

- A reaction PIP may remain visually alive through breathing, eye movement, and expression while
  silent. Do not imply that it speaks unless its real audio is explicitly authored.
- For a video Item, add `audio="include"` only when that source should contribute sound; otherwise keep
  it visual-only and put the intended audio on a separate Track.
- Only the active Script speaker moves their mouth in a dialogue format. A listener PIP reacts without
  invented words.
- Preserve the same identity, wardrobe, crop, scale, and placement when a PIP persists across edits.

## Time and review the PIP

- Enter or exit on a perceptible story event, Script Selection, or Moment. Use the assembled
  SemanticTrack as the timing authority.
- Give the audience enough time to recognize both the base evidence and the PIP; avoid rapid toggling
  that makes neither readable.
- Review edge quality first, then placement on every relevant base shot, then entry/exit motion, audio
  inclusion, caption collision, and final stack order.
- Pin an accepted cutout or PIP source through `.svrun` `build-record` and `satisfy` instead of
  regenerating it with unrelated downstream changes.
