import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { interpretSource } from "../src/interpret/document.js";

const STYLES = `<?svml using="@narratage/svs@1"?>

<sheet version="1">
  speech.visual { fit: cover; }
  media.card { stack-order: 40; fit: cover; frame-paint: #16161d; }
</sheet>
`;

const HEADER = `<?svml using="@narratage/markup@1"?>\n\n`;
const IMPORTS = `  <import from="@narratage/script@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="media-track" from="@narratage/media-track@1"/>
  <import as="space" from="@narratage/spatial@1"/>
  <import as="studio" source="./studio.svs"/>
`;
const SCRIPT = `  <script id="story">
    <opening><HOST>A @claim word here@/claim now.</opening>
  </script>
`;
const SPATIAL = `  <space:Canvas id="v" width="1080" height="1920"/>
  <space:Frame id="full" within={v} left="0%" top="0%" right="100%" bottom="100%"/>
`;
const SPINE = `  <speech:Spine id="s" frame-rate="24" visual-frame={full}
    visual-appearance={studio.speech.visual} visual-z="0">
    <speech:Take video={x.video} segment={story.segment.opening}/>
  </speech:Spine>
`;

async function read(source: string): Promise<{ ok: boolean; message: string; range: unknown }> {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-source-"));
  writeFileSync(join(directory, "main.svml"), source, "utf8");
  writeFileSync(join(directory, "studio.svs"), STYLES, "utf8");
  try {
    await interpretSource({ source: join(directory, "main.svml"), root: directory, revision: 1 });
    return { ok: true, message: "", range: undefined };
  } catch (error) {
    const held = error as { message?: string; range?: unknown; offset?: unknown };
    return {
      ok: false,
      message: held.message ?? String(error),
      // A parser error owns no element but does know the offset it gave up at.
      range: held.range ?? held.offset,
    };
  }
}

/**
 * A Source the author is halfway through writing must fail in a way they can
 * act on: a sentence naming what is wrong, and somewhere in the file to look.
 * These are all real authoring mistakes rather than corrupt input.
 */
const mistakes: readonly (readonly [string, string])[] = [
  ["a Frame written with insets instead of edges",
    `${HEADER}<svml>\n${IMPORTS}${SCRIPT}  <space:Canvas id="v" width="1080" height="1920"/>\n`
    + `  <space:Frame id="bad" within={v} left="10%" top="0%" right="10%" bottom="100%"/>\n</svml>\n`],
  ["a Frame inside a parent that does not exist",
    `${HEADER}<svml>\n${IMPORTS}${SCRIPT}  <space:Frame id="f" within={ghost} left="0%" top="0%" right="100%" bottom="100%"/>\n</svml>\n`],
  ["an Item during a Selection nobody wrote",
    `${HEADER}<svml>\n${IMPORTS}${SCRIPT}${SPATIAL}${SPINE}`
    + `  <media-track:Track id="b" map={t.map} space={s.space} canvas={v}>\n`
    + `    <media-track:Item id="i" video={x.video} during={story.selection.ghost}\n`
    + `      frame={full} appearance={studio.media.card}/>\n  </media-track:Track>\n</svml>\n`],
  ["an Item with no timing at all",
    `${HEADER}<svml>\n${IMPORTS}${SCRIPT}${SPATIAL}${SPINE}`
    + `  <media-track:Track id="b" map={t.map} space={s.space} canvas={v}>\n`
    + `    <media-track:Item id="i" video={x.video} frame={full} appearance={studio.media.card}/>\n`
    + `  </media-track:Track>\n</svml>\n`],
  ["a Spine with no Takes",
    `${HEADER}<svml>\n${IMPORTS}${SCRIPT}${SPATIAL}`
    + `  <speech:Spine id="s" frame-rate="24" visual-frame={full}\n`
    + `    visual-appearance={studio.speech.visual} visual-z="0">\n  </speech:Spine>\n</svml>\n`],
  ["a Spine whose frame rate is a word",
    `${HEADER}<svml>\n${IMPORTS}${SCRIPT}${SPATIAL}`
    + `  <speech:Spine id="s" frame-rate="fast" visual-frame={full}\n`
    + `    visual-appearance={studio.speech.visual} visual-z="0">\n`
    + `    <speech:Take video={x.video} segment={story.segment.opening}/>\n  </speech:Spine>\n</svml>\n`],
  ["an empty Media Track",
    `${HEADER}<svml>\n${IMPORTS}${SCRIPT}${SPATIAL}${SPINE}`
    + `  <media-track:Track id="b" map={t.map} space={s.space} canvas={v}>\n  </media-track:Track>\n</svml>\n`],
  ["a Script with no words in it",
    `${HEADER}<svml>\n${IMPORTS}  <script id="story">\n    <opening></opening>\n  </script>\n${SPATIAL}</svml>\n`],
  ["two Scripts",
    `${HEADER}<svml>\n${IMPORTS}${SCRIPT}${SCRIPT}</svml>\n`],
];

for (const [name, source] of mistakes) {
  test(`${name} is reported against the element that caused it`, async () => {
    const result = await read(source);
    assert.equal(result.ok, false, "this Source is genuinely broken");
    assert.ok(result.message.length > 10, "the message says something");
    // Without this the author is told what is wrong but not where, in a file
    // that may hold a dozen Frames.
    assert.notEqual(result.range, undefined, `no place to look: ${result.message}`);
  });
}

/** Input that is not really a Source at all still fails cleanly. */
const corrupt: readonly (readonly [string, string])[] = [
  ["an empty file", ""],
  ["only a Source Header", HEADER],
  ["a document that is not SVML", `${HEADER}<nope></nope>\n`],
  ["an unclosed document", `${HEADER}<svml>\n${IMPORTS}${SCRIPT}`],
];

for (const [name, source] of corrupt) {
  test(`${name} fails with a message rather than a crash`, async () => {
    const result = await read(source);
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 10);
  });
}

test("a Source that declares nothing but a Script still reads", async () => {
  const result = await read(`${HEADER}<svml>\n${IMPORTS}${SCRIPT}</svml>\n`);
  assert.equal(result.ok, true, "no Tracks is not an error");
});

test("importing a module the preview does not interpret is not an error", async () => {
  // Most of a Source is produced by Providers. Reading around them is the job.
  const result = await read(
    `${HEADER}<svml>\n  <import from="@narratage/script@1"/>\n`
    + `  <import as="what" from="@nobody/nothing@1"/>\n${SCRIPT}</svml>\n`,
  );
  assert.equal(result.ok, true);
});
