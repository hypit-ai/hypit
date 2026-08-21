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
- One overlay that continues across a cut remains one visual track spanning its full observed
  lifetime. Do not recreate it once per shot.
- Merge two or three incorrectly split clips only when continuity evidence confirms one camera shot
  and the combined duration stays inside the duration ceiling of the model that will generate it. Past
  that ceiling, preserve the continuous-group relationship without creating an overlong shot.
- Reuse whole-reference people, voice and product evidence. Describe the promoted product once and
  do not replace it with conflicting per-shot descriptions.

Shot boundaries are observation windows, not authoring units. Never generate independent SVML per
shot and concatenate it afterward.

## A system that spans shots is authored once

- A visual system that persists across cuts — captions, a running list that keeps its state, a
  progress indicator, a persistent badge or logo, a recurring lower third — is one system: one
  Program, one Track and one shared Style over its full observed lifetime, even when the visible
  words, items or values change.
- Do not recreate the system per shot, and do not create a second Style because a new shot begins. A
  new shot is never itself evidence of a change in appearance.
- Author an observed local difference as a scoped variation inside the one system, on exactly the
  words, items or interval where it was observed.
- Whether the system is one Program with per-item timing or separate instances is decided by the
  declared vocabulary of the chosen package, never by shot count.
- The `persistent_systems` observation from `prepare_reference` reports these systems for the whole
  reference, including whether each one's appearance ever changes and where. Use it instead of
  inferring lifetimes from per-shot prose.

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
