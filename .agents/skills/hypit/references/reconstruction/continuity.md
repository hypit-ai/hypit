# Reference-video continuity rules

These invariants override superficial layer order and shot boundaries:

- Whoever is speaking owns base. The lowest, largest or currently visible picture does not decide
  base.
- Picture ownership and sound ownership are independent. Full-screen B-roll may cover the picture
  while the prior speaker remains base and owns the continuing sound.
- A person in silent B-roll cannot become speaker or base merely because their mouth appears to
  move.
- A shot with no visible person can carry continuing off-screen speech. Do not clear sound or base.
- For alternating, overlapping or simultaneous speech, use audio evidence rather than visible-person
  presence. The `agent` observer has no audio evidence and reads these from the frames and the word
  timings instead, which `observers.md` describes: the transcript is what decides whether anyone is
  speaking at all, so it is what keeps a moving mouth in B-roll from becoming a speaker.
- The same evidence decides which picture is the Segment's base: whichever one shows a person saying
  the words the transcript carries there, however small it is and whatever is on screen over it. A
  full-frame board with the speaker inset in a corner is a base the size of the corner, covered by
  most of a board. `../playbooks/craft/generated-dependencies.md` holds the rule and what follows
  from it for stack order.
- One overlay that continues across a cut remains one visual track spanning its full observed
  lifetime. Do not recreate it once per shot.
- Merge two or three incorrectly split clips only when continuity evidence confirms one camera shot
  and the combined duration stays inside the duration ceiling of the model that will generate it. Past
  that ceiling, preserve the continuous-group relationship without creating an overlong shot.
- Reuse whole-reference people, voice and product evidence. Describe the promoted product once and
  do not replace it with conflicting per-shot descriptions.

Shot boundaries are observation windows, not authoring units. Never generate independent SVML per
shot and concatenate it afterward.

## Their seconds are not authoring units either

The shot list arrives as a table of `start_seconds` and `end_seconds`, and copying those numbers into
the Source as `start="3.25s" end="7.42s"` is the shortest path from the evidence to a placement. It
produces a reconstruction that is wrong the moment it is built.

Those seconds describe the reference's own clock, and nothing in the reconstruction runs on that
clock. `../script-time.md` says what to bind to instead, and why an Item bound to 3.25 seconds points
at whichever word happens to land there. The reference's seconds then decide *which words* a Selection
spans, which is what they can honestly tell you, rather than which frame an Item starts on.

## A system that spans shots is authored once

`../script-time.md` states the rule: one Program, one Track, one shared Style over the system's full
lifetime, and a scoped variation rather than a second Style. A new shot is never itself evidence of a
change in appearance.

The reference supplies the lifetimes. The `persistent_systems` observation from `prepare_reference`
is an inventory and a first lifetime hypothesis for the whole reference, including whether each one's
appearance appears to change. Do not treat its position, exact visible intervals or continuity as
settled geometry: confirm those claims with the relevant shot-level visual observations or an
exactly-one-shot narrow question. When the whole-reference inventory conflicts with a shot-specific
observation, preserve the conflict and use the more specific shot evidence for the reconstruction.

## Base pictures and designed fields

What may be a base picture at all, when a full screen is one graphic composition rather than a
generated base plus an overlay, and where a missing picture comes from, are decided by
`../playbooks/craft/graphic-compositions.md`. Read it; the rules there are not restated here and are
not weakened by any observation, package convenience or check result.

Each shot's `visual` observation states explicitly whether the frame is a depicted scene or a flat
designed field, describes each framed element's inner picture separately from its frame, and says
whether the picture moves. Those answers are the evidence for this decision and for how a stretch too
short to be a take is reconstructed.

The whole-reference `places` observation says how many locations there are, which camera positions
appear in each, and which parts of the video use each one — the grouping that
`../playbooks/craft/generated-dependencies.md` turns into one accepted image per position. Do not
infer that grouping by comparing per-shot prose.
