import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { interpretSource } from "../src/interpret/document.js";
import { readRunSource } from "../src/interpret/run.js";

const SOURCE = `<?svml using="@narratage/markup@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="media-track" from="@narratage/media-track@1"/>
  <import as="space" from="@narratage/spatial@1"/>
  <import as="studio" source="./studio.svs"/>

  <script id="story">
    <opening><HOST>A @claim preview reads the source@/claim here.</opening>
  </script>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <space:Frame id="full" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>

  <seedance:TextVideo id="take" model="mini" duration="10"/>

  <speech:Spine id="speech" frame-rate="24"
    visual-frame={full} visual-appearance={studio.speech.visual} visual-z="0">
    <speech:Take video={take.video} segment={story.segment.opening}/>
  </speech:Spine>

  <media-track:Track id="broll" map={timing.map} space={speech.space} canvas={vertical}>
    <media-track:Item id="one" video={take.video} during={story.selection.claim}
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

function workspace(): string {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-degrade-"));
  writeFileSync(join(directory, "main.svml"), SOURCE, "utf8");
  writeFileSync(join(directory, "studio.svs"), STYLES, "utf8");
  return directory;
}

/**
 * Read a Source against a Run Source that is wrong in some specific way.
 *
 * The Playground is pointed at whatever an author has in front of them, which
 * includes Run Sources that are half-written, name files that do not exist yet,
 * or were copied from another project. None of that is a reason to show nothing:
 * the Source itself is still readable, and every one of these must degrade to
 * the estimate rather than throw.
 */
async function readWith(svrun: string): Promise<Awaited<ReturnType<typeof interpretSource>>> {
  const directory = workspace();
  writeFileSync(join(directory, "build.svrun"), svrun, "utf8");
  return interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  });
}

const HEADER = `<?svml using="@narratage/run-markup@1"?>\n\n`;

const broken: readonly (readonly [string, string])[] = [
  ["an empty Run Source", `${HEADER}<svrun version="1">\n</svrun>\n`],
  ["no author and no target", `${HEADER}<svrun version="1">\n  <target output="final.video"/>\n</svrun>\n`],
  [
    "a satisfy naming a candidate that was never declared",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <satisfy output="timing.map" candidate="ghost"/>\n</svrun>\n`,
  ],
  [
    "a candidate nothing satisfies",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <file id="spare" from="./nothing.mp4" media-type="video/mp4"/>\n</svrun>\n`,
  ],
  [
    "a file that is not there",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <file id="gone" from="./absent.mp4" media-type="video/mp4"/>\n`
    + `  <satisfy output="take.video" candidate="gone"/>\n</svrun>\n`,
  ],
  [
    "a file with no media type",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <file id="bare" from="./main.svml"/>\n`
    + `  <satisfy output="take.video" candidate="bare"/>\n</svrun>\n`,
  ],
  [
    "a file that is not video at all",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <file id="text" from="./studio.svs" media-type="text/plain"/>\n`
    + `  <satisfy output="take.video" candidate="text"/>\n</svrun>\n`,
  ],
  [
    "a video media type over bytes that are not a video",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <file id="lying" from="./studio.svs" media-type="video/mp4"/>\n`
    + `  <satisfy output="take.video" candidate="lying"/>\n</svrun>\n`,
  ],
  [
    "a build-record for a store that does not exist",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <build-record id="prior" build="never-ran" output="timing.map"/>\n`
    + `  <satisfy output="timing.map" candidate="prior"/>\n</svrun>\n`,
  ],
  [
    "a build-record missing its attributes",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <build-record id="half" build="only-this"/>\n`
    + `  <satisfy output="timing.map" candidate="half"/>\n</svrun>\n`,
  ],
  [
    "a fragment candidate, which names a way to produce rather than a thing",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <fragment id="made" using="alias:something"/>\n`
    + `  <satisfy output="timing.map" candidate="made"/>\n</svrun>\n`,
  ],
  [
    "two candidates sharing one id",
    `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`
    + `  <file id="same" from="./a.mp4" media-type="video/mp4"/>\n`
    + `  <file id="same" from="./b.mp4" media-type="video/mp4"/>\n`
    + `  <satisfy output="take.video" candidate="same"/>\n</svrun>\n`,
  ],
  ["a truncated Run Source", `${HEADER}<svrun version="1">\n  <author source="./main.svml"/>\n`],
  ["something that is not a Run Source at all", `${HEADER}<svml>\n</svml>\n`],
  ["an empty file", ""],
  ["only a header", HEADER],
];

for (const [name, svrun] of broken) {
  test(`${name} degrades to the estimate`, async () => {
    const result = await readWith(svrun);
    assert.equal(result.snapshot.provenance.timing, "estimated");
    // The Source is what matters, and it is still fully readable.
    assert.ok(result.snapshot.space.frameCount > 1);
    assert.equal(result.snapshot.tracks.flatMap((track) => track.clips).length, 2);
    for (const clip of result.snapshot.tracks.flatMap((track) => track.clips)) {
      assert.ok(clip.placeholder, "no material was actually resolved");
    }
  });
}

test("a value pointing at malformed JSON is ignored", async () => {
  const directory = workspace();
  writeFileSync(join(directory, "timing.json"), "{ not json at all", "utf8");
  writeFileSync(join(directory, "build.svrun"), `${HEADER}<svrun version="1">
  <author source="./main.svml"/>
  <value id="broken" type="@narratage/semantic-map@1#CompleteSemanticMap" from="./timing.json"/>
  <satisfy output="timing.map" candidate="broken"/>
</svrun>
`, "utf8");
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"), run: join(directory, "build.svrun"), root: directory, revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.timing, "estimated");
});

test("a value pointing at a directory is ignored", async () => {
  const directory = workspace();
  mkdirSync(join(directory, "timing.json"));
  writeFileSync(join(directory, "build.svrun"), `${HEADER}<svrun version="1">
  <author source="./main.svml"/>
  <value id="folder" type="@narratage/semantic-map@1#CompleteSemanticMap" from="./timing.json"/>
  <satisfy output="timing.map" candidate="folder"/>
</svrun>
`, "utf8");
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"), run: join(directory, "build.svrun"), root: directory, revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.timing, "estimated");
});

test("a map supplied without its frame domain is not half-believed", async () => {
  // Locating a Segment needs both: a measured map against an estimated ruler
  // would place every span against the wrong frame.
  const directory = workspace();
  writeFileSync(join(directory, "timing.json"), JSON.stringify({
    contract: "svml.complete-semantic-map@1", tokens: [], anchors: [],
  }), "utf8");
  writeFileSync(join(directory, "build.svrun"), `${HEADER}<svrun version="1">
  <author source="./main.svml"/>
  <value id="only-map" type="@narratage/semantic-map@1#CompleteSemanticMap" from="./timing.json"/>
  <satisfy output="timing.map" candidate="only-map"/>
</svrun>
`, "utf8");
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"), run: join(directory, "build.svrun"), root: directory, revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.timing, "estimated");
});

test("a Run Source in another directory resolves its files from its own", async () => {
  const directory = workspace();
  const elsewhere = mkdtempSync(join(tmpdir(), "svml-playground-elsewhere-"));
  writeFileSync(join(elsewhere, "build.svrun"), `${HEADER}<svrun version="1">
  <author source="./main.svml"/>
  <file id="near" from="./beside-me.mp4" media-type="video/mp4"/>
  <satisfy output="take.video" candidate="near"/>
</svrun>
`, "utf8");
  const facts = readRunSource(join(elsewhere, "build.svrun"))!;
  // Nothing exists at that path, so nothing is claimed.
  assert.deepEqual(facts.files, []);
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"), run: join(elsewhere, "build.svrun"), root: directory, revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.picture, "estimated");
});
