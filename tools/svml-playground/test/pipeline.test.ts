import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { estimateTiming } from "../src/pipeline/estimate.js";
import { preview } from "../src/pipeline/preview.js";
import { readSource } from "../src/pipeline/session.js";

const SOURCE = `<?svml using="@narratage/markup@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="wording" from="@narratage/text@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="whisperx" from="@narratage/whisperx@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="media-track" from="@narratage/media-track@1"/>
  <import as="space" from="@narratage/spatial@1"/>
  <import as="studio" source="./studio.svs"/>

  <script id="story">
    <opening><HOST>One @claim two three four@/claim five six.</opening>
  </script>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <space:Frame id="full" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>

  <wording:Value id="direction">A person talking to camera.</wording:Value>
  <seedance:TextVideo id="take" model="mini" prompt={direction} duration="10" generate-audio="true"/>
  <seedance:TextVideo id="cut" model="mini" prompt={direction} duration="5"/>

  <speech:Spine id="speech" frame-rate="24"
    visual-frame={full} visual-appearance={studio.speech.visual} visual-z="0">
    <speech:Take video={take.video} segment={story.segment.opening}/>
  </speech:Spine>
  <whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>

  <media-track:Track id="broll" map={timing.map} space={speech.space} canvas={vertical}>
    <media-track:Item id="on-claim" video={cut.video} during={story.selection.claim}
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

/**
 * Standing in for material nobody has shot needs a tool to draw with. Where
 * there is none - which is every machine that has not installed ffmpeg, CI
 * among them - a Track with no footage cannot be built, and the preview says so
 * instead of drawing something.
 */
const CAN_DRAW = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
})();

function project(run?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-pipeline-"));
  writeFileSync(join(directory, "main.svml"), SOURCE, "utf8");
  writeFileSync(join(directory, "studio.svs"), STYLES, "utf8");
  if (run !== undefined) writeFileSync(join(directory, "build.svrun"), run, "utf8");
  return directory;
}

/**
 * A Source on its own has neither footage nor timings, which is the state it
 * spends most of its life in. It still has to be watchable, and it has to say
 * which parts of what is shown were invented.
 */
test("a Source with no Run Source still builds every Track", async () => {
  const directory = project();
  const built = await preview(join(directory, "main.svml"));

  // Timings are placed from the Script's own words, which needs no tool at all.
  assert.equal(built.timing, "estimated", "nothing supplied timings");
  assert.ok(built.tracks.length > 0, "the Source's Tracks were found");
  if (!CAN_DRAW) {
    assert.equal(built.placeholders.length, 0, "nothing was stood in for without a tool to draw it");
    return;
  }
  assert.ok(built.placeholders.length > 0, "material nobody supplied stands in");
  const drawn = built.tracks.filter((track) => track.track !== undefined);
  assert.ok(drawn.length >= 2, `speech and B-roll both build; built ${drawn.map((t) => t.name).join(",")}`);
  // Placing words at a guessed pace is not knowing when they are said, and a
  // preview that does not distinguish the two is lying about what it shows.
  assert.ok(
    built.tracks.every((track) => track.track === undefined || track.unserved.length === 0),
    "a Track that was built was not also reported as waiting",
  );
});

test("a Track nobody can build costs only itself", async () => {
  const directory = project();
  const built = await preview(join(directory, "main.svml"));
  // A Track that could not be built has to say what it was waiting for,
  // whether that is a Provider or the material itself.
  for (const track of built.tracks) {
    if (track.track !== undefined) continue;
    assert.ok(
      track.unserved.length > 0 || track.errors.length > 0,
      `${track.name} says why it has no picture`,
    );
  }
  if (!CAN_DRAW) return;
  assert.ok(
    built.tracks.some((track) => track.track !== undefined),
    "one Track waiting does not stop the others",
  );
});

/**
 * A Run Source that names material this machine has never produced is an
 * ordinary state part-way through a production, not a broken Source.
 */
test("material an earlier build produced is refused with a reason, not a crash", async () => {
  const directory = project(`<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="broll.visual"/>
  <build-record id="accepted" build="never-built-here" output="take.video"/>
  <satisfy output="take.video" candidate="accepted"/>
</svrun>
`);
  const built = await preview(join(directory, "main.svml"), join(directory, "build.svrun"));
  // Reading the Run Source and reporting what it could not reach needs no tool;
  // only drawing a stand-in does.
  assert.ok(built.refused.length > 0, "the preview says what it could not read");
  assert.ok(built.tracks.length > 0, "and still opens");
  if (CAN_DRAW) assert.ok(built.tracks.some((track) => track.track !== undefined));
  assert.match(built.refused.map((item) => item.reason).join(" "), /never-built-here/u);
});

test("a snapshot points its clips back at the tags that placed them", async () => {
  const directory = project();
  const { snapshot } = await readSource({
    source: join(directory, "main.svml"), packageRoot: directory, revision: 7,
  });
  assert.equal(snapshot.revision, 7);
  // Without a tool to draw stand-ins there are no Presents, so there is no
  // timeline to point anywhere.
  if (!CAN_DRAW) return;
  assert.ok(snapshot.space.frameCount > 1);
  const clips = snapshot.tracks.flatMap((track) => track.clips);
  assert.ok(clips.length > 0, "the timeline is not empty");
  const placed = clips.filter((clip) => clip.elementRange !== undefined);
  assert.ok(placed.length > 0, "at least one clip knows which tag placed it");
  for (const clip of placed) {
    const written = snapshot.source.text.slice(clip.elementRange!.start, clip.elementRange!.end);
    assert.match(written, /^</u, `${clip.id} points at a tag, not at the middle of one`);
  }
  // Every Present the picture draws must be addressable, or selecting a clip
  // could not box it.
  assert.match(snapshot.preview.srcdoc, /data-svml-present-id/u);
});

test("the Script's markers carry the frames its words are said on", async () => {
  const directory = project();
  const { snapshot } = await readSource({
    source: join(directory, "main.svml"), packageRoot: directory, revision: 1,
  });
  assert.ok(snapshot.script !== undefined, "the Script reported where its markers are");
  assert.ok(snapshot.script.selections.some((item) => item.id === "claim"));
  assert.ok(snapshot.script.tokens.length > 0, "words are placed on the timeline");
  for (const token of snapshot.script.tokens) {
    assert.ok(token.endFrame >= token.startFrame, `${token.id} does not run backwards`);
  }
});

/** Estimation is arithmetic over identities the packages own, and must be stable. */
test("estimated timings are strictly increasing and reproducible", () => {
  const narrative = {
    segments: [{ id: "a", startAnchorId: "segment:a:start", endAnchorId: "segment:a:end" }],
    tokens: [
      { id: "t1", segmentId: "a", startAnchorId: "t1:s", endAnchorId: "t1:e", text: "Extraordinary" },
      { id: "t2", segmentId: "a", startAnchorId: "t2:s", endAnchorId: "t2:e", text: "," },
      { id: "t3", segmentId: "a", startAnchorId: "t3:s", endAnchorId: "t3:e", text: "yes" },
    ],
  };
  const rate = { numerator: 24, denominator: 1 };
  const first = estimateTiming(narrative, rate);
  assert.deepEqual(first, estimateTiming(narrative, rate), "the same words give the same times");

  const anchors = (first.map as { anchors: readonly { identity: string; frame: number }[] }).anchors;
  const frames = new Map(anchors.map((anchor) => [anchor.identity, anchor.frame]));
  // A word that occupies no frames cannot be pointed at, and punctuation is
  // still a word for this purpose.
  for (const token of narrative.tokens) {
    assert.ok(frames.get(token.endAnchorId)! > frames.get(token.startAnchorId)!, `${token.text} occupies time`);
  }
  assert.equal(frames.get("segment:a:start"), 0, "a Segment opens where its first word does");
  assert.equal(frames.get("segment:a:end"), frames.get("t3:e"), "and closes where its last one ends");
});

/**
 * A build reads assets only from the Source's own directory. A preview that
 * read further would show a Source that cannot be built, which is the one thing
 * it must never do.
 */
test("an asset outside the Source's directory is refused, as a build refuses it", async () => {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-boundary-"));
  const outside = mkdtempSync(join(tmpdir(), "svml-playground-outside-"));
  writeFileSync(join(outside, "stray.png"), "not really a picture", "utf8");
  writeFileSync(join(directory, "main.svml"), `<?svml using="@narratage/markup@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="media" from="@narratage/media@1"/>
  <script id="story"><opening><HOST>One two.</opening></script>
  <media:Image id="stray" src="${join(outside, "stray.png")}"/>
</svml>
`, "utf8");

  await assert.rejects(
    async () => await preview(join(directory, "main.svml")),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /outside/u, "the reason names the boundary");
      assert.match(message, /stray\.png/u, "and the file that crossed it");
      return true;
    },
  );
});

/**
 * How long a programme runs is what the Source says, not what this machine
 * managed to draw. Stand-ins need a tool to draw with, and a machine without
 * one drew nothing; the timeline shrank to a single frame while the words still
 * ran to the end, so a marker past the end read as live. Every machine has to
 * agree about the length, whatever it can picture.
 */
test("the programme is as long as the Source says, drawn or not", async () => {
  const directory = project();
  const built = await preview(join(directory, "main.svml"));
  const { snapshot } = await readSource({
    source: join(directory, "main.svml"), packageRoot: directory, revision: 1,
  });

  const spoken = Math.max(0, ...(snapshot.script?.tokens ?? []).map((token) => token.endFrame));
  assert.ok(spoken > 0, "the Script was placed");
  assert.ok(
    snapshot.space.frameCount >= spoken,
    `the timeline (${snapshot.space.frameCount}f) covers every word (${spoken}f)`,
  );
  // Which is the same claim the Tracks were built against.
  const drawn = Math.max(0, ...built.tracks.flatMap((track) =>
    ((track.track as { presents?: readonly { span: { endFrameExclusive: number } }[] } | undefined)?.presents ?? [])
      .map((present) => present.span.endFrameExclusive)));
  assert.ok(snapshot.space.frameCount >= drawn, "and covers every clip");
});
