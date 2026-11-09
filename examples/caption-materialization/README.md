# Complete Caption materialization

This example closes the old Script-to-NLE subtitle goal without keeping Script, Narrative or
Transcript dependencies in the NLE project.

[`story.script`](story.script) contains three A-roll Segments, a roleless base presentation,
ALICE and BOB turns, explicit Cue breaks and one Dual Text display-to-speech replacement. The
ordinary project program in [`compose.ts`](compose.ts):

1. treats three selected A-roll products and their corrected TimedTranscript files as already
   available;
2. aligns each Script Segment locally to its corresponding media;
3. projects every display Unit to exact speech boundaries;
4. resolves base, role, one-Cue warning and hidden presentation rules;
5. creates one complete ordinary NLE Caption Component Item per Cue.

Every Item contains display Words, Unit membership, per-Word attributes and Cue-local exact Unit time even when its
current Style does not animate them. Items bind the Fine package's `style` slot to explicit shared Component Values,
and all Caption Items reference one NLE-owned Picture Layout. Karaoke or typography can therefore change once for
every bound Cue, while a Cue can still edit its own Words and attributes. The hidden Cue is materialized as
`enabled: false`, so the editor can restore it without rebuilding semantic timing.

Run the executable example from the repository root:

```bash
pnpm exec tsx examples/caption-materialization/compose.ts
pnpm exec tsx --test examples/caption-materialization/test/*.test.ts
```

The printed `hypit.nle@1` JSON contains three ordinary Media Items and nine ordinary Caption
Component Items, four shared Fine Style values and one shared Picture Layout. It has no live Script,
Narrative, Transcript or named-anchor lookup.
