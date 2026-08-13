import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { interpretSource } from "../src/interpret/document.js";
import type { PlaygroundSnapshot } from "../src/shared.js";

const SOURCE = `<?svml using="@narratage/markup@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="whisperx" from="@narratage/whisperx@1"/>
  <import as="media-track" from="@narratage/media-track@1"/>
  <import as="space" from="@narratage/spatial@1"/>
  <import as="film" from="@narratage/film@1"/>
  <import as="studio" source="./studio.svs"/>

  <script id="story">
    <opening><HOST>A @claim shallow preview reads the source@/claim, so the
      @proof timeline is the SVML@/proof, not a file.</opening>
  </script>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <space:Frame id="speech-frame" within={vertical}
    left="0%" top="0%" right="100%" bottom="100%"/>
  <space:Frame id="card-a" within={vertical}
    left="8%" top="16%" right="92%" bottom="46%"/>
  <space:Frame id="card-b" within={vertical}
    left="12%" top="52%" right="88%" bottom="78%"/>

  <seedance:TextVideo id="take" model="mini" duration="10" generate-audio="true"/>

  <speech:Spine id="speech" frame-rate="30"
    visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
    <speech:Take video={take.video} segment={story.segment.opening}/>
  </speech:Spine>
  <whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>

  <media-track:Track id="broll" map={timing.map} space={speech.space} canvas={vertical}>
    <media-track:Item id="broll-one" video={take.video} during={story.selection.claim}
      frame={card-a} appearance={studio.media.card} motion={studio.motion.card}/>
    <media-track:Item id="broll-two" video={take.video} during={story.selection.proof}
      frame={card-b} appearance={studio.media.wide}/>
  </media-track:Track>

  <film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
    <film:Track source={speech.visual}/>
  </film:Film>
</svml>
`;

const STYLES = `<?svml using="@narratage/svs@1"?>

<sheet version="1">
  film.vertical { background: #09090B; }
  speech.visual { fit: cover; }
  media.card {
    stack-order: 40; fit: cover; playback: hold-start;
    frame-paint: #16161d; clip: rounded; radius: 24; padding: 12 12;
  }
  media.wide { stack-order: 41; fit: cover; playback: hold-start; frame-paint: #1d1620; }
  motion.card {
    enter: slide; enter-frames: 5; enter-direction: up; enter-easing: ease-out;
    exit: fade; exit-frames: 5; exit-easing: ease-in;
  }
</sheet>
`;

async function fixture(): Promise<PlaygroundSnapshot> {
  // A directory holding only a Source and its style sheet: no package lock, no
  // runtime profile, no build. That is the case the preview exists for.
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-"));
  writeFileSync(join(directory, "main.svml"), SOURCE, "utf8");
  writeFileSync(join(directory, "studio.svs"), STYLES, "utf8");
  return (await interpretSource({ source: join(directory, "main.svml"), root: directory, revision: 7 })).snapshot;
}

test("a Source with no build reads as a timeline", async () => {
  const snapshot = await fixture();
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.mode, "synthetic");
  assert.equal(snapshot.provenance.timing, "estimated");
  assert.equal(snapshot.space.canvasWidth, 1080);
  assert.equal(snapshot.space.canvasHeight, 1920);
  assert.deepEqual(snapshot.space.frameRate, { numerator: 30, denominator: 1 });
  assert.equal(snapshot.space.clearColor, "#09090B");
  assert.ok(snapshot.space.frameCount > 1);
});

test("B-roll shares one row above the base track", async () => {
  const snapshot = await fixture();
  const media = snapshot.tracks.find((track) => track.kind === "media")!;
  const speech = snapshot.tracks.find((track) => track.kind === "speech")!;
  assert.equal(media.row, 0);
  assert.equal(speech.row, 1);
  assert.equal(media.clips.length, 2);
  assert.equal(speech.clips.length, 1);
  assert.deepEqual(media.clips.map((clip) => clip.authoredId), ["broll-one", "broll-two"]);
});

test("clip spans are ordered, disjoint and inside the program", async () => {
  const snapshot = await fixture();
  const media = snapshot.tracks.find((track) => track.kind === "media")!;
  const [first, second] = media.clips;
  assert.ok(first!.startFrame < first!.endFrameExclusive);
  assert.ok(second!.startFrame >= first!.endFrameExclusive, "authored Selections do not overlap");
  assert.ok(second!.endFrameExclusive <= snapshot.space.frameCount);
  const base = snapshot.tracks.find((track) => track.kind === "speech")!.clips[0]!;
  assert.equal(base.startFrame, 0);
  assert.equal(base.endFrameExclusive, snapshot.space.frameCount);
});

test("Frame edges are absolute positions, so a Placement Frame has real pixels", async () => {
  const snapshot = await fixture();
  const [first, second] = snapshot.tracks.find((track) => track.kind === "media")!.clips;
  // left 8% .. right 92% of 1080 is 86.4 .. 993.6.
  assert.deepEqual(first!.frame, { xPx: 86.4, yPx: 307.2, widthPx: 907.2, heightPx: 576 });
  // media.card pads by 12 on every edge; media.wide declares no padding.
  assert.deepEqual(first!.contentFrame, { xPx: 98.4, yPx: 319.2, widthPx: 883.2, heightPx: 552 });
  assert.deepEqual(second!.contentFrame, second!.frame);
});

test("motion is reported rather than baked into a single rectangle", async () => {
  const snapshot = await fixture();
  const [first, second] = snapshot.tracks.find((track) => track.kind === "media")!.clips;
  assert.equal(first!.animated, true, "broll-one declares enter and exit motion");
  assert.equal(second!.animated, false, "broll-two declares none");
});

test("ranges slice back to the exact authored text", async () => {
  const snapshot = await fixture();
  const text = snapshot.source.text;
  for (const track of snapshot.tracks) {
    for (const clip of track.clips) {
      const element = text.slice(clip.elementRange.start, clip.elementRange.end);
      assert.ok(
        element.startsWith("<media-track:Item") || element.startsWith("<speech:Take"),
        `unexpected element slice: ${element.slice(0, 40)}`,
      );
    }
  }
  const media = snapshot.tracks.find((track) => track.kind === "media")!;
  assert.equal(
    text.slice(media.clips[0]!.bindingRange!.start, media.clips[0]!.bindingRange!.end),
    "@claim shallow preview reads the source@/claim",
  );
  assert.equal(
    text.slice(media.clips[1]!.bindingRange!.start, media.clips[1]!.bindingRange!.end),
    "@proof timeline is the SVML@/proof",
  );
});

test("Provider-produced surfaces are reported, not silently dropped", async () => {
  const snapshot = await fixture();
  assert.deepEqual(
    [...new Set(snapshot.unsupported.map((item) => item.tag))].sort(),
    ["seedance:TextVideo", "whisperx:Alignment"],
  );
  const text = snapshot.source.text;
  for (const item of snapshot.unsupported) {
    assert.ok(text.slice(item.range.start, item.range.end).startsWith(`<${item.tag}`));
  }
});

test("every top-level element is addressable from the code pane", async () => {
  const snapshot = await fixture();
  const text = snapshot.source.text;
  assert.ok(snapshot.elements.some((element) => element.tag === "media-track:Track"));
  for (const element of snapshot.elements) {
    assert.ok(text.slice(element.range.start, element.range.end).startsWith(`<${element.tag}`));
  }
  const track = snapshot.elements.find((element) => element.tag === "media-track:Track")!;
  assert.deepEqual(track.children.map((child) => child.id), ["broll-one", "broll-two"]);
});

test("spoken words are placed on the timeline", async () => {
  const snapshot = await fixture();
  const tokens = snapshot.script!.tokens;
  assert.ok(tokens.length > 0);
  const text = snapshot.source.text;
  // Every token must slice back to a word of the Script, and occupy frames the
  // playhead can actually land on.
  let previous = -1;
  for (const token of tokens) {
    assert.match(text.slice(token.range.start, token.range.end), /\S/u);
    assert.ok(token.endFrame > token.startFrame, `${token.id} occupies no frames`);
    assert.ok(token.startFrame >= previous, "tokens advance in Script order");
    previous = token.startFrame;
  }
  assert.ok(tokens.at(-1)!.endFrame <= snapshot.space.frameCount);
  assert.equal(text.slice(tokens[0]!.range.start, tokens[0]!.range.end), "A");
});

test("Anchored and Aspect Frames resolve to real pixels", async () => {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-frames-"));
  writeFileSync(join(directory, "studio.svs"), STYLES, "utf8");
  writeFileSync(join(directory, "main.svml"), SOURCE
    .replace(
      `  <space:Frame id="card-b" within={vertical}\n    left="12%" top="52%" right="88%" bottom="78%"/>`,
      `  <space:AnchoredFrame id="card-b" within={vertical}\n`
      + `    x="50%" y="60%" width="50%" height="300px" anchor="center"/>\n`
      + `  <space:AspectFrame id="card-c" within={vertical}\n`
      + `    x="50%" y="20%" width="40%" aspect="16/9" anchor="center"/>`,
    ), "utf8");
  const snapshot = (await interpretSource({ source: join(directory, "main.svml"), root: directory, revision: 1 })).snapshot;
  const second = snapshot.tracks.find((track) => track.kind === "media")!.clips[1]!;
  // anchor center at 50%/60% of 1080x1920, 50% wide and 300px tall.
  assert.deepEqual(second.frame, { xPx: 270, yPx: 1002, widthPx: 540, heightPx: 300 });
});
