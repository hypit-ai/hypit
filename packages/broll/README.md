# `@svml/broll`

Official B-roll authoring and lowering package. It owns B-roll items, local
entrance/exit motion, pair transitions, source audio and transition SFX. It
emits ordinary `VisualTrack` and `AudioTrack` values whose Presents participate
in Composition by their own absolute z.

It does not generate media, select a Provider, read another Track, sample the
accumulated lower composite or implement Base/Screen FX.
