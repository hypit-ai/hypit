import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { artifactPath } from "../src/build/artifacts.js";
import { readBuild } from "../src/build/state.js";
import { interpretSource } from "../src/interpret/document.js";
import { estimateTiming } from "../src/interpret/timing.js";
import { readRunSource } from "../src/interpret/run.js";
import { parseScript } from "@narratage/script";

/**
 * Reading a frame rate off a file needs ffprobe, which not every machine has
 * and CI does not. The preview degrades to a placeholder without it, which is
 * asserted below unconditionally; only the cases that need a real probe are
 * skipped.
 */
const probing = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const needsProbe = probing ? {} : { skip: "ffprobe is not installed" };

const SOURCE = `<?svml using="@narratage/markup@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="media-track" from="@narratage/media-track@1"/>
  <import as="space" from="@narratage/spatial@1"/>
  <import as="studio" source="./studio.svs"/>

  <script id="story">
    <opening><HOST>A @claim shallow preview reads the source@/claim here.</opening>
  </script>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <space:Frame id="speech-frame" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>
  <space:Frame id="card-a" within={vertical} left="8%" top="16%" right="92%" bottom="46%"/>

  <seedance:TextVideo id="take" model="mini" duration="10"/>

  <speech:Spine id="speech" frame-rate="30"
    visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
    <speech:Take video={take.video} segment={story.segment.opening}/>
  </speech:Spine>

  <media-track:Track id="broll" map={timing.map} space={speech.space} canvas={vertical}>
    <media-track:Item id="broll-one" video={take.video} during={story.selection.claim}
      frame={card-a} appearance={studio.media.card}/>
  </media-track:Track>
</svml>
`;

const STYLES = `<?svml using="@narratage/svs@1"?>

<sheet version="1">
  speech.visual { fit: cover; }
  media.card { stack-order: 40; fit: cover; frame-paint: #16161d; }
</sheet>
`;

const SCHEMA = `
CREATE TABLE svml_store_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), schema_version INTEGER NOT NULL) STRICT;
CREATE TABLE svml_builds (build_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state_json TEXT NOT NULL) STRICT;
CREATE TABLE svml_build_catalog (build_id TEXT PRIMARY KEY, core_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, descriptor_json TEXT NOT NULL) STRICT;
`;

function workspace(): string {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-build-"));
  writeFileSync(join(directory, "main.svml"), SOURCE, "utf8");
  writeFileSync(join(directory, "studio.svs"), STYLES, "utf8");
  return directory;
}

/**
 * A measured map that is provably not the estimate: every frame doubled. The
 * anchors come from the estimator so their identities match the Script exactly,
 * which is the part a hand-written fixture would get wrong.
 */
function doubledTiming() {
  const parsed = parseScript("build.test", "<opening><HOST>A @claim shallow preview reads the source@/claim here.</opening>");
  const { map, space } = estimateTiming(parsed, { numerator: 30, denominator: 1 });
  return {
    map: {
      contract: "svml.complete-semantic-map@1",
      tokens: map.tokens.map((token) => ({
        ...token,
        startSec: token.startSec * 2, endSec: token.endSec * 2,
        startFrame: token.startFrame * 2, endFrame: token.endFrame * 2,
      })),
      anchors: map.anchors.map((anchor) => ({ ...anchor, timeSec: anchor.timeSec * 2, frame: anchor.frame * 2 })),
    },
    space: { contract: "svml.program-space@1", durationSec: space.durationSec * 2, frameRate: { numerator: 30, denominator: 1 } },
    estimatedFrames: Math.round(space.durationSec * 30),
  };
}

type StoreOptions = {
  readonly schemaVersion?: number;
  readonly status?: string;
  readonly withVideo?: boolean;
};

function writeStore(directory: string, options: StoreOptions = {}): ReturnType<typeof doubledTiming> {
  const timing = doubledTiming();
  const state = join(directory, ".svml");
  mkdirSync(state, { recursive: true });
  const database = new DatabaseSync(join(state, "state.sqlite"));
  database.exec(SCHEMA);
  database.prepare("INSERT INTO svml_store_meta (singleton, schema_version) VALUES (1, ?)")
    .run(options.schemaVersion ?? 6);
  const digest = `sha256:${"ab".repeat(32)}`;
  database.prepare("INSERT INTO svml_builds (build_id, revision, state_json) VALUES (?, 0, ?)")
    .run("demo-build", JSON.stringify({
      status: options.status ?? "complete",
      plan: { selections: [{ output: "speech.space.output", record: "speech.space" }] },
      records: [
        { id: "timing.map", type: { module: { name: "@narratage/semantic-map" }, name: "CompleteSemanticMap" }, value: { kind: "inline", value: timing.map } },
        { id: "speech.space", type: { module: { name: "@narratage/program-space" }, name: "ProgramSpace" }, value: { kind: "inline", value: timing.space } },
        ...(options.withVideo === false ? [] : [{
          id: "final.video.record",
          type: { module: { name: "@narratage/artifact" }, name: "Blob" },
          value: { kind: "blob", digest, size: 1234, mediaType: "video/mp4" },
        }]),
      ],
    }));
  database.prepare("INSERT INTO svml_build_catalog (build_id, core_id, created_at, updated_at, descriptor_json) VALUES (?, ?, 1, 1, ?)")
    .run("demo-build", "sha256:core", JSON.stringify({
      aliases: [
        { name: "timing.map", ref: { kind: "record", id: "timing.map" } },
        // A logical-output alias has to be resolved through plan.selections.
        { name: "speech.space", ref: { kind: "logical-output", id: "speech.space.output" } },
        { name: "final.video", ref: { kind: "record", id: "final.video.record" } },
      ],
    }));
  database.close();
  return timing;
}

test("a completed build supplies measured timings", async () => {
  const directory = workspace();
  writeStore(directory);
  const facts = readBuild(join(directory, "main.svml"))!;
  assert.equal(facts.buildId, "demo-build");
  assert.equal(facts.map?.contract, "svml.complete-semantic-map@1");
  assert.equal(facts.space?.contract, "svml.program-space@1");
  assert.equal(facts.video?.mediaType, "video/mp4");
  assert.ok(facts.artifactRoot.endsWith(join(".svml", "artifacts")));
});

test("a logical-output alias resolves through the plan", async () => {
  const directory = workspace();
  writeStore(directory);
  // speech.space is aliased to an output, not a record, so this only passes if
  // the reader follows plan.selections the way the CLI does.
  assert.ok(readBuild(join(directory, "main.svml"))?.space !== undefined);
});

test("measured timings replace the estimate in the timeline", async () => {
  const directory = workspace();
  const timing = writeStore(directory);
  const before = (await interpretSource({ source: join(directory, "main.svml"), root: directory, revision: 1 })).snapshot;
  assert.equal(before.provenance.timing, "measured");
  assert.match(before.provenance.note, /demo-build/u);
  // The stored map doubles every frame, so the timeline must be twice as long
  // as the estimate it replaced.
  assert.equal(before.space.frameCount, timing.estimatedFrames * 2);
});

test("the reader gives up rather than guessing", async () => {
  const clean = workspace();
  assert.equal(readBuild(join(clean, "main.svml")), undefined, "no store at all");

  const newer = workspace();
  writeStore(newer, { schemaVersion: 7 });
  assert.equal(readBuild(join(newer, "main.svml")), undefined, "a store from a newer schema");

  const failed = workspace();
  writeStore(failed, { status: "failed" });
  assert.equal(readBuild(join(failed, "main.svml")), undefined, "records a failed build never validated");
});

test("a store the reader rejects leaves the preview on estimates", async () => {
  const directory = workspace();
  writeStore(directory, { status: "active" });
  const snapshot = (await interpretSource({ source: join(directory, "main.svml"), root: directory, revision: 1 })).snapshot;
  assert.equal(snapshot.provenance.timing, "estimated");
  assert.equal(snapshot.mode, "synthetic");
  assert.ok(snapshot.tracks.flatMap((track) => track.clips).length > 0, "the preview still works");
});

test("artifact digests map onto the content-addressed layout", async () => {
  const hex = "ab".repeat(32);
  assert.equal(artifactPath("/store", `sha256:${hex}`), join("/store", "sha256", "ab", hex));
  assert.equal(artifactPath("/store", "sha512:abc"), undefined, "only sha256 is laid out this way");
  assert.equal(artifactPath("/store", "sha256:nothex"), undefined);
});

test("a Run Source yields the material it already names", async () => {
  const directory = workspace();
  writeFileSync(join(directory, "opening.mp4"), "not really a video", "utf8");
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <file id="approved" from="./opening.mp4" media-type="video/mp4"/>
  <file id="missing" from="./absent.mp4" media-type="video/mp4"/>
  <build-record id="earlier" build="prior-build" output="timing.map"/>
  <satisfy output="final.video" candidate="approved"/>
  <satisfy output="take.video" candidate="missing"/>
  <satisfy output="timing.map" candidate="earlier"/>
</svrun>
`, "utf8");

  const facts = readRunSource(join(directory, "build.svrun"))!;
  assert.equal(facts.author, "./main.svml");
  assert.deepEqual(facts.targets, ["final.video"]);
  // A path an author wrote but has not produced is not material.
  assert.deepEqual(facts.files.map((file) => file.output), ["final.video"]);
  assert.deepEqual(facts.reused, [{ output: "timing.map", build: "prior-build", from: "timing.map" }]);
});

test("a Run Source file becomes the picture without any build", async () => {
  const directory = workspace();
  writeFileSync(join(directory, "opening.mp4"), "not really a video", "utf8");
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <file id="approved" from="./opening.mp4" media-type="video/mp4"/>
  <satisfy output="final.video" candidate="approved"/>
</svrun>
`, "utf8");

  const result = await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  });
  assert.equal(result.snapshot.mode, "real");
  assert.equal(result.snapshot.preview.kind, "video");
  assert.equal(result.video?.path, join(directory, "opening.mp4"));
  // A rendered programme is the picture, but nothing in it was placed by a
  // measured map, so the timeline is still an estimate. The two are separate
  // claims and the badges keep them separate.
  assert.equal(result.snapshot.provenance.picture, "estimated");
  assert.equal(result.snapshot.provenance.timing, "estimated");
});

test("an unsatisfied or absent Run Source changes nothing", async () => {
  const directory = workspace();
  assert.equal(readRunSource(join(directory, "absent.svrun")), undefined);
  const result = await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "absent.svrun"),
    root: directory,
    revision: 1,
  });
  assert.equal(result.snapshot.mode, "synthetic");
  assert.equal(result.video, undefined);
});

test("material in the wrong frame domain is refused, not resampled", needsProbe, async () => {
  const directory = workspace();
  // The fixture Source declares 30 fps; this footage is 24.
  const footage = join(process.cwd(), "docs/public/street-interview/scene-1.mp4");
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <file id="footage" from="${footage}" media-type="video/mp4"/>
  <satisfy output="take.video" candidate="footage"/>
</svrun>
`, "utf8");
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  })).snapshot;
  // Refusing loudly is the point: a placeholder beside a file the author knows
  // exists would read as a bug rather than as a boundary.
  assert.equal(snapshot.refused.length, 1);
  assert.equal(snapshot.refused[0]!.output, "take.video");
  assert.match(snapshot.refused[0]!.reason, /24\/1 fps.*30\/1/u);
  assert.ok(snapshot.tracks.flatMap((track) => track.clips).every((clip) => clip.placeholder));
});

test("material in the program's frame domain becomes real frames", needsProbe, async () => {
  const directory = workspace();
  const footage = join(process.cwd(), "docs/public/street-interview/scene-1.mp4");
  writeFileSync(join(directory, "main.svml"), SOURCE.replace('frame-rate="30"', 'frame-rate="24"'), "utf8");
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <file id="footage" from="${footage}" media-type="video/mp4"/>
  <satisfy output="take.video" candidate="footage"/>
</svrun>
`, "utf8");
  const result = await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  });
  assert.deepEqual(result.snapshot.refused, []);
  // Both the Take and the Item name take.video, so both stop being placeholders.
  assert.ok(result.snapshot.tracks.flatMap((track) => track.clips).every((clip) => !clip.placeholder));
  assert.equal(result.material.size, 1, "one file, served once");
  const srcdoc = result.snapshot.preview.kind === "hyperframes" ? result.snapshot.preview.srcdoc : "";
  assert.match(srcdoc, /<video[^>]*src="\/__svml\/material\/sha256:[a-f0-9]{64}"/u);
});

test("a Run Source can name the timing, with no build of this Source", async () => {
  // Which timestamps a preview reads is an authoring decision, so <satisfy> is
  // where it belongs. Without this the only measured timeline is one this
  // Source has already been built for.
  const directory = workspace();
  const timing = doubledTiming();
  writeFileSync(join(directory, "timing.json"), JSON.stringify(timing.map), "utf8");
  writeFileSync(join(directory, "space.json"), JSON.stringify(timing.space), "utf8");
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <value id="prior-map" type="@narratage/semantic-map@1#CompleteSemanticMap" from="./timing.json"/>
  <value id="prior-space" type="@narratage/program-space@1#ProgramSpace" from="./space.json"/>
  <satisfy output="timing.map" candidate="prior-map"/>
  <satisfy output="speech.space" candidate="prior-space"/>
</svrun>
`, "utf8");

  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.timing, "measured");
  assert.match(snapshot.provenance.note, /Run Source supplied/u);
  // The supplied map doubles every frame, so it must have displaced the estimate.
  assert.equal(snapshot.space.frameCount, timing.estimatedFrames * 2);
});

test("a supplied value of the wrong shape is ignored, not trusted", async () => {
  const directory = workspace();
  writeFileSync(join(directory, "timing.json"), JSON.stringify({ contract: "something.else@1" }), "utf8");
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <value id="wrong" type="@narratage/semantic-map@1#CompleteSemanticMap" from="./timing.json"/>
  <satisfy output="timing.map" candidate="wrong"/>
</svrun>
`, "utf8");
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.timing, "estimated");
});

test("a Run Source can reuse a value an earlier build accepted", async () => {
  // The ordinary way to read a measured timeline while the Source is still being
  // edited: the alignment from a previous build is still the right alignment.
  const directory = workspace();
  const timing = writeStore(directory);
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <build-record id="prior-map" build="demo-build" output="timing.map"/>
  <build-record id="prior-space" build="demo-build" output="speech.space"/>
  <satisfy output="timing.map" candidate="prior-map"/>
  <satisfy output="speech.space" candidate="prior-space"/>
</svrun>
`, "utf8");
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  })).snapshot;
  assert.equal(snapshot.provenance.timing, "measured");
  assert.equal(snapshot.space.frameCount, timing.estimatedFrames * 2);
});

test("a build-record naming a build that is not there falls back", async () => {
  const directory = workspace();
  writeStore(directory);
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <build-record id="gone" build="no-such-build" output="timing.map"/>
  <satisfy output="timing.map" candidate="gone"/>
</svrun>
`, "utf8");
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  })).snapshot;
  // The latest build still supplies both, so this stays measured — the point is
  // that naming a missing build does not throw.
  assert.ok(snapshot.tracks.flatMap((track) => track.clips).length > 0);
});

test("material an author supplied is never silently absent", async () => {
  // Whether or not this machine can probe a file, a Take backed by footage must
  // either show it or say why it does not. Falling back to a placeholder with no
  // explanation reads as a bug in the preview rather than a missing tool.
  const directory = workspace();
  const footage = join(process.cwd(), "docs/public/street-interview/scene-1.mp4");
  writeFileSync(join(directory, "build.svrun"), `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
  <file id="footage" from="${footage}" media-type="video/mp4"/>
  <satisfy output="take.video" candidate="footage"/>
</svrun>
`, "utf8");
  const snapshot = (await interpretSource({
    source: join(directory, "main.svml"),
    run: join(directory, "build.svrun"),
    root: directory,
    revision: 1,
  })).snapshot;

  const clips = snapshot.tracks.flatMap((track) => track.clips);
  const shown = clips.filter((clip) => !clip.placeholder).length;
  if (shown === 0) {
    assert.equal(snapshot.refused.length, 1, "a placeholder here needs a reason");
    assert.equal(snapshot.refused[0]!.output, "take.video");
    assert.match(snapshot.refused[0]!.reason, /fps|probed/u);
  } else {
    assert.deepEqual(snapshot.refused, [], "nothing was refused, so nothing to explain");
  }
});
