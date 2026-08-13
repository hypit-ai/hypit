import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { interpretSource } from "../src/interpret/document.js";

const examples = join(dirname(fileURLToPath(import.meta.url)), "../../../examples");

/**
 * Every Source in the repository must read.
 *
 * The Playground is meant to be pointed at whatever an author is working on, so
 * "it works on the example I wrote it against" is not the bar. A Source that
 * declares no Tracks, or no Canvas, or leans entirely on Providers is still a
 * Source, and refusing to read one is a bug rather than a boundary.
 */
const sources = readdirSync(examples, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(examples, entry.name, "main.svml")))
  .map((entry) => entry.name);

test("the repository ships Sources to read", () => {
  assert.ok(sources.length >= 5, `only found ${sources.length} example Sources`);
});

for (const name of sources) {
  test(`${name} reads as a timeline`, async () => {
    const source = join(examples, name, "main.svml");
    const run = join(examples, name, "build.svrun");
    const result = await interpretSource({
      source,
      ...(existsSync(run) ? { run } : {}),
      root: join(examples, name),
      revision: 1,
    });
    const snapshot = result.snapshot;

    assert.ok(snapshot.space.frameCount >= 1, "a program occupies at least one frame");
    assert.equal(snapshot.source.text.length > 0, true);
    assert.ok(snapshot.elements.length > 0, "the code pane has something to address");

    for (const track of snapshot.tracks) {
      for (const clip of track.clips) {
        assert.ok(clip.endFrameExclusive > clip.startFrame, `${clip.id} occupies no frames`);
        assert.ok(clip.endFrameExclusive <= snapshot.space.frameCount, `${clip.id} runs past the program`);
        assert.ok(clip.frame.widthPx > 0 && clip.frame.heightPx > 0, `${clip.id} has an empty Frame`);
        const element = snapshot.source.text.slice(clip.elementRange.start, clip.elementRange.end);
        assert.ok(element.startsWith("<"), `${clip.id} does not point at an element`);
      }
    }
    // A measured map may place a word in no time at all: where evidence merged
    // or dropped a short word, the aligner declines to invent a duration for it
    // rather than spreading one over its neighbours. Ordering still holds, and a
    // word with no window simply never lights up.
    let previous = -1;
    for (const token of snapshot.script?.tokens ?? []) {
      assert.ok(token.endFrame >= token.startFrame, `${token.id} ends before it starts`);
      assert.ok(token.startFrame >= previous, `${token.id} is spoken out of order`);
      previous = token.startFrame;
    }
  });
}

test("a Source with no Tracks still reads, and says what it is missing", async () => {
  // bootstrap is Script and nothing else. It has no frame domain and nowhere to
  // draw, which is a true thing to report rather than a reason to refuse.
  const source = join(examples, "bootstrap/main.svml");
  const snapshot = (await interpretSource({ source, root: join(examples, "bootstrap"), revision: 1 })).snapshot;
  assert.deepEqual(snapshot.tracks, []);
  assert.match(snapshot.provenance.note, /no Speech Spine/u);
  assert.match(snapshot.provenance.note, /no Canvas/u);
  assert.ok((snapshot.script?.tokens.length ?? 0) > 0, "the Script is still placed in time");
});

test("the canonical Caption chain is interpreted", async () => {
  // A Track names a Program, a Program names a default Style, and a Style names
  // a font Stack. Reading only the last of those would fail every Source that
  // writes Captions the way the language intends.
  const source = join(examples, "talking-film-graph-check/main.svml");
  const snapshot = (await interpretSource({
    source, root: join(examples, "talking-film-graph-check"), revision: 1,
  })).snapshot;
  assert.match(snapshot.provenance.note, /Caption Cues timed from the same map/u);
  const html = snapshot.preview.kind === "hyperframes" ? snapshot.preview.srcdoc : "";
  assert.match(html, /@font-face/u);
});

test("an estimated word always occupies a frame", async () => {
  // Nothing is unknown when estimating, so unlike a measured map there is no
  // honest reason for a word to occupy no time.
  const source = join(examples, "street-interview-preview/main.svml");
  const snapshot = (await interpretSource({
    source, root: join(examples, "street-interview-preview"), revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.timing, "estimated", "read without its Run Source");
  for (const token of snapshot.script!.tokens) {
    assert.ok(token.endFrame > token.startFrame, `${token.id} occupies no frames`);
  }
});

test("a measured map may leave a word unplaced, and the preview tolerates it", async () => {
  const source = join(examples, "street-interview-preview/main.svml");
  const snapshot = (await interpretSource({
    source,
    run: join(examples, "street-interview-preview/build.svrun"),
    root: join(examples, "street-interview-preview"),
    revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.timing, "measured");
  const unplaced = snapshot.script!.tokens.filter((token) => token.endFrame === token.startFrame);
  assert.ok(unplaced.length > 0, "this transcript has fewer words than the Script has tokens");
  assert.ok(unplaced.length < snapshot.script!.tokens.length / 4, "but most words are placed");
});
