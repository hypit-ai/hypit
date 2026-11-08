# Ranking debate: the SVML replacement production

This production deliberately covers the useful double seam that the old all-enclosing SVML file tried
to own: generated media enters an edit, and measured speech locates visual behavior. It uses ordinary
subsystem files instead of preserving one live cross-domain program.

## Files and phases

1. `generation.graph.json` generates two portraits, two reusable voice identities, two cloned follow-up
   lines and four speaking videos. `generation.canvas.json` is only their saved spatial view.
2. Accepted video outputs are materialized under `media/<turn>/` as ordinary `.media.json` bundles.
3. `analysis.graph.json` is generated after acceptance and runs WhisperX over those files. Each exported
   TimedTranscript is attached to its Media Asset as an editable representation.
4. `scripts/compose.ts` parses `story.script`, aligns each Segment with its own corrected transcript and
   writes `film.nle.json` in one transaction-oriented pass.
5. `film.nle.json` is the editable truth. Caption Cues are normal Fine Caption Component Items; the
   ranking board and verdict are project Component Items with direct local time parameters.
6. `hypit nle export film.nle.json --to exports/ranking-debate.mp4` performs the final local render.

There is no `.svml` or `.svs` production source. Prompt Kit wording is carried into the exact Graph
node prompts as authored text; it does not justify retaining a second general-purpose language.

The checked-in Graph is safe to inspect before login. Running it incurs the paid work recorded in
`BRIEF.md`. HypiHub authentication is intentionally project/profile scoped:

```bash
hypit auth login hypihub.default --project . --runtime hypit.runtime.json
hypit generation run generation.graph.json --target alice-video-1 --target bob-video-1 \
  --target alice-video-2 --target bob-video-2
```

The paid reference run completed all ten generation nodes. Its four accepted videos are checked in as
ordinary Media Asset bundles under `media/`. The independent analysis run completed Media loading,
audio evidence projection and WhisperX transcription for all four videos. The editable compatible
transcripts live beside those assets; `scripts/compose.ts` corrects them against `story.script` and
attaches each one as the asset's `speech.zh` representation.

Run the deterministic half again with:

```bash
pnpm compose
pnpm render
```

`pnpm compose` writes seven complete Fine Caption Cue Items, including local Word timing, role-based
styles, the disabled Cue and the one-off warning style. It also resolves four named phrases once and
writes their direct rational times into the project-owned Ranking Board and Verdict parameters.
`pnpm render` resolves installed package facets and exports the ordinary NLE.

The accepted reference output is `exports/ranking-debate.mp4`: 720×1280, 24 fps, 772 frames and about
32.17 seconds. The production passed the decisive deletion test: `film.nle.json` has no live Build,
Product, Provider, Script, Transcript, semantic-anchor or reverse-lookup dependency. The compose program
is useful for reproducing the materialization, but it is not required to open, edit or export the NLE.

## Why the project program is not another SVML

The stable contracts are the files and package-owned parameter ABIs: Generation Graph, Media Asset,
TimedTranscript, NLE Project and each Component's validated parameters. TypeScript is only the frontend
used here to read those files and submit NLE transactions. A future Studio action or CLI command can
submit the same transaction without understanding this script. Components share the NLE Item host
contract; they do not contribute keywords to a new central language.
