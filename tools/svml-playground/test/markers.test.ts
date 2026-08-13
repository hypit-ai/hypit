import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { interpretSource } from "../src/interpret/document.js";
import { liveRanges, markerTones, spanAtOffset } from "../src/ui/markers.js";
import type { PlaygroundSnapshot } from "../src/shared.js";

/** `@outer` encloses `@inner`, and both sit inside the `<opening>` Segment. */
const SOURCE = `<?svml using="@narratage/markup@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="media-track" from="@narratage/media-track@1"/>
  <import as="space" from="@narratage/spatial@1"/>
  <import as="studio" source="./studio.svs"/>

  <script id="story">
    <opening><HOST>One @outer two three @inner four five@/inner six@/outer seven.</opening>
    <answer><HOST>Eight nine ten.</answer>
  </script>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <space:Frame id="full" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>

  <seedance:TextVideo id="take" model="mini" duration="10"/>

  <speech:Spine id="speech" frame-rate="30"
    visual-frame={full} visual-appearance={studio.speech.visual} visual-z="0">
    <speech:Take video={take.video} segment={story.segment.opening}/>
    <speech:Take video={take.video} segment={story.segment.answer}/>
  </speech:Spine>

  <media-track:Track id="broll" map={timing.map} space={speech.space} canvas={vertical}>
    <media-track:Item id="on-outer" video={take.video} during={story.selection.outer}
      frame={full} appearance={studio.media.card}/>
  </media-track:Track>
</svml>
`;

const STYLES = `<?svml using="@narratage/svs@1"?>

<sheet version="1">
  speech.visual { fit: cover; }
  media.card { stack-order: 40; fit: cover; frame-paint: #16161d; }
</sheet>
`;

async function fixture(): Promise<PlaygroundSnapshot> {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-markers-"));
  writeFileSync(join(directory, "main.svml"), SOURCE, "utf8");
  writeFileSync(join(directory, "studio.svs"), STYLES, "utf8");
  return (await interpretSource({ source: join(directory, "main.svml"), root: directory, revision: 1 })).snapshot;
}

test("a Segment is the outermost level and Selections nest inside it", async () => {
  const snapshot = await fixture();
  const segment = snapshot.script!.segments.find((item) => item.id === "opening")!;
  const outer = snapshot.script!.selections.find((item) => item.id === "outer")!;
  const inner = snapshot.script!.selections.find((item) => item.id === "inner")!;
  assert.equal(segment.depth, 0, "nothing encloses a Segment");
  assert.equal(outer.depth, 1, "its Segment encloses it");
  assert.equal(inner.depth, 2, "its Segment and @outer both enclose it");
});

test("tones follow the level, not the identity", async () => {
  const snapshot = await fixture();
  const tones = markerTones(snapshot);
  // Two Segments are the same kind of thing, so they read the same.
  assert.equal(tones.get("opening"), tones.get("answer"));
  assert.notEqual(tones.get("opening"), tones.get("outer"));
  assert.notEqual(tones.get("outer"), tones.get("inner"));
});

test("an enclosing range stays live while an inner one is", async () => {
  const snapshot = await fixture();
  const inner = snapshot.script!.selections.find((item) => item.id === "inner")!;
  const tokens = snapshot.script!.tokens.filter((token) =>
    token.range.start >= inner.occurrences[0]!.open.start
    && token.range.end <= inner.occurrences[0]!.close.end);
  const middle = Math.floor((tokens[0]!.startFrame + tokens.at(-1)!.endFrame) / 2);

  // Nesting is the whole point of the markers: replacing the outer outline with
  // the inner one would hide the relationship being expressed.
  const live = liveRanges(snapshot, middle).map((span) => span.id);
  assert.deepEqual(live, ["opening", "outer", "inner"], "outermost first");
});

test("a range that binds nothing is still live", async () => {
  // Only @outer drives a Media Item. @inner places nothing, and still means
  // something, so it must appear.
  const snapshot = await fixture();
  const bound = snapshot.tracks.flatMap((track) => track.clips).map((clip) => clip.binding);
  assert.ok(!bound.some((binding) => binding.kind !== "program" && binding.id === "inner"));
  const inner = snapshot.script!.selections.find((item) => item.id === "inner")!;
  const tokens = snapshot.script!.tokens.filter((token) =>
    token.range.start >= inner.occurrences[0]!.open.start
    && token.range.end <= inner.occurrences[0]!.close.end);
  const middle = Math.floor((tokens[0]!.startFrame + tokens.at(-1)!.endFrame) / 2);
  assert.ok(liveRanges(snapshot, middle).some((span) => span.id === "inner"));
});

test("nothing is live outside the speech", async () => {
  const snapshot = await fixture();
  assert.deepEqual(liveRanges(snapshot, snapshot.space.frameCount + 100), []);
});

test("an offset resolves to the tightest range written around it", async () => {
  const snapshot = await fixture();
  const text = snapshot.source.text;
  // Clicking marked prose should land in the innermost claim, not its parent.
  assert.equal(spanAtOffset(snapshot, text.indexOf("four"))?.id, "inner");
  assert.equal(spanAtOffset(snapshot, text.indexOf("two"))?.id, "outer");
  assert.equal(spanAtOffset(snapshot, text.indexOf("seven"))?.id, "opening");
  assert.equal(spanAtOffset(snapshot, text.indexOf("Eight"))?.id, "answer");
  assert.equal(spanAtOffset(snapshot, text.indexOf("<space:Canvas")), undefined);
});

test("a resolved span carries the frame its speech starts on", async () => {
  const snapshot = await fixture();
  const text = snapshot.source.text;
  const inner = spanAtOffset(snapshot, text.indexOf("four"))!;
  const outer = spanAtOffset(snapshot, text.indexOf("two"))!;
  // Landing on the inner marker's own first frame is what keeps a click from
  // being thrown out to whatever encloses it.
  assert.ok(inner.startFrame > outer.startFrame);
  assert.ok(inner.endFrame <= outer.endFrame);
});
