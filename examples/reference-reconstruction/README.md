# Reference reconstruction: ranking-typewriter video

Reverse-engineered from `/Users/hsinli/Downloads/ranking-typewriter-video.mp4` (45 s, 20 shots).

Sources: `main.svml`, `studio.svs`, `build.svrun`, `hypit.runtime.json`, and the project-local package
`@hypit/local-linerank` (owns the paper ranking board; nothing installed expressed it).

## Accepted deviations

Recorded rather than hidden, because a difference nobody wrote down reads afterwards as a difference
nobody noticed. Each of these is a place where the reconstruction does not match the reference, with
the reason it was accepted as-is.

- **Caption appearance is a guess.** Observations described it inconsistently — heavy outline+shadow
  in one shot, a black rounded pill in two others. Chose bold white sans with a black stroke and a
  translucent pill; not verified against the reference frame.
- **Board title's mixed typography is a single face.** The reference's title runs a serif-italic
  line and a sans-bold line; the package takes one font. Used `shadows-into-light` for both.
- **The hand-drawn circle is a closed oval.** The reference is an unclosed black hand-drawn curve;
  approximated with a wobbly closed oval (irregular radius, slight rotation).
- **No typewriter click SFX.** One boundary observation mentioned it; all audio observations were
  pure speech, and no tick asset exists. Not authored.
- **Speaker framing is one image across all takes.** The reference cuts between medium and close
  framings; simplified to a single reference image.
- **The board background followed the blind comparison, not the observation.** One observation said
  lined paper with a pink margin; the blind comparison and a pixel check showed grey graph-paper grid
  with no pink line. Implemented the grid.

The board was the only element that could be rendered without paid generation; it received two blind
comparison rounds against the reference `shot-015` frame and was stopped at the two-attempt ceiling
with the deviations above still present.
