import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { materializeRecord, runVideoCli as runCli } from "@svml/video-cli";

test("CLI Pin is explicit substitute selection rather than an exact-history privilege", async () => {
  await assert.rejects(
    async () => await runCli([
      "build", "unused.svml",
      "--target", "shot",
      "--runtime", "unused-runtime.ts",
      "--pin", "shot=sha256:historical",
    ], { write() {} }),
    /--pin attaches substitute Candidates; add --accept-substitute/u,
  );
});

test("CLI does not confuse Build persistence with the removed --out convenience", async () => {
  await assert.rejects(
    async () => await runCli([
      "build", "unused.svrun", "--runtime", "unused-runtime.ts", "--out", "final.mp4",
    ], { write() {} }),
    /Build always archives accepted Records/u,
  );
});

test("official v2 CLI checks a real Script source through the Node compiler host", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-"));
  const file = join(root, "main.svml");
  await writeFile(join(root, "studio.svs"), `<sheet version="1">
    caption.host {
      color: #ffffff;
      font-size: 72;
    }
  </sheet>`, "utf8");
  await writeFile(file, `<svml>
    <import from="@svml/script@1"/>
    <import as="studio" from="./studio.svs" using="@svml/svs@1"/>
    <script id="story">
      <opening>
        <ALICE>Meaning becomes the source.
      </opening>
    </script>
  </svml>`, "utf8");
  let output = "";
  await runCli(["check", file], { write: (text) => { output += text; } });
  const result = JSON.parse(output) as {
    readonly ok: boolean;
    readonly units: number;
    readonly modules: readonly string[];
    readonly exports: readonly { readonly name: string; readonly kind: string }[];
  };
  assert.equal(result.ok, true);
  assert.equal(result.units, 2);
  assert.deepEqual([...result.modules].sort(), [
    "@svml/narrative@0.0.0-dev",
    "@svml/script@0.0.0-dev",
    "@svml/svs@1",
  ]);
  assert.deepEqual(result.exports, [
    { name: "story", type: {
      module: { name: "@svml/narrative", version: "0.0.0-dev" },
      name: "Narrative",
    }, kind: "record" },
    { name: "story.caption", type: {
      module: { name: "@svml/narrative", version: "0.0.0-dev" },
      name: "CaptionProjection",
    }, kind: "record" },
    { name: "story.segment.opening", type: {
      module: { name: "@svml/narrative", version: "0.0.0-dev" },
      name: "NarrativeExcerpt",
    }, kind: "record" },
    { name: "story.segment.opening.dialogue", type: {
      module: { name: "@svml/narrative", version: "0.0.0-dev" },
      name: "NarrativeDialogueExcerpt",
    }, kind: "record" },
    { name: "story.segment.opening.speech", type: {
      module: { name: "@svml/narrative", version: "0.0.0-dev" },
      name: "NarrativeSpeechExcerpt",
    }, kind: "record" },
  ]);
});

test("official media and Seedance Surfaces lower author intent into exact generation steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-generation-"));
  const file = join(root, "main.svml");
  await writeFile(join(root, "host.png"), new Uint8Array([137, 80, 78, 71]));
  await writeFile(file, `<svml>
    <import from="@svml/script@1"/>
    <import as="media" from="@svml/media@1"/>
    <import as="seedance" from="@svml/seedance@1"/>
    <script id="story"><opening><HOST>Say exactly these words.</opening></script>
    <media:Image id="host" src="./host.png"/>
    <seedance:Prompt id="direction">
      Locked medium close-up in a quiet daylight studio.
    </seedance:Prompt>
    <seedance:Speech id="take" model="mini" dialogue={story.segment.opening.dialogue}
      prompt={direction} duration="5">
      <seedance:Reference image={host} role="character"/>
    </seedance:Speech>
    <seedance:Video id="motion" model="mini" prompt={direction} duration="5"/>
  </svml>`, "utf8");

  let checkedOutput = "";
  await runCli(["check", file], { write: (text) => { checkedOutput += text; } });
  const checked = JSON.parse(checkedOutput) as {
    readonly ok: boolean;
    readonly sourceAssets: readonly { readonly mediaType: string }[];
    readonly exports: readonly { readonly name: string }[];
  };
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.sourceAssets.map((item) => item.mediaType), ["image/png"]);
  assert.deepEqual(checked.exports.map((item) => item.name), [
    "direction",
    "host",
    "motion.request",
    "motion.video",
    "story",
    "story.caption",
    "story.segment.opening",
    "story.segment.opening.dialogue",
    "story.segment.opening.speech",
    "take",
    "take.request",
  ]);

  let planOutput = "";
  await runCli([
    "plan", file,
    "--target", "take",
    "--target", "motion.video",
  ], { write: (text) => { planOutput += text; } });
  const plan = JSON.parse(planOutput) as {
    readonly goals: readonly unknown[];
    readonly steps: readonly { readonly producer: { readonly name: string } }[];
  };
  assert.equal(plan.goals.length, 2);
  assert.deepEqual(
    plan.steps.map((step) => step.producer.name).sort(),
    [
      "request-seedance-2-mini",
      "request-seedance-2-mini",
      "select-primary-video",
      "select-primary-video",
    ],
  );
});

test(".svrun is the complete human-readable Target graph used by plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-run-"));
  const source = join(root, "main.svml");
  const run = join(root, "preview.svrun");
  await writeFile(source, `<svml>
    <import as="seedance" from="@svml/seedance@1"/>
    <seedance:Prompt id="direction">A quiet locked-off studio shot.</seedance:Prompt>
    <seedance:Video id="motion" model="mini" prompt={direction} duration="4"/>
  </svml>`, "utf8");
  await writeFile(run, `<svrun version="1" source="./main.svml" targets="preview">
    <target-set id="preview">
      <target output="motion.video" accepts="exact"/>
    </target-set>
  </svrun>`, "utf8");

  let output = "";
  await runCli(["plan", run], { write: (text) => { output += text; } });
  const plan = JSON.parse(output) as {
    readonly goals: readonly unknown[];
    readonly steps: readonly { readonly producer: { readonly name: string } }[];
  };
  assert.equal(plan.goals.length, 1);
  assert.deepEqual(plan.steps.map((item) => item.producer.name), [
    "request-seedance-2-mini",
    "select-primary-video",
  ]);
  await assert.rejects(
    async () => await runCli(["plan", run, "--target", "motion.video"], { write() {} }),
    /.svrun owns Targets/u,
  );
});

test("CLI accepts a declarative Runtime Profile without an executable config module", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-runtime-profile-"));
  const profile = join(root, "svml.runtime.json");
  await writeFile(profile, JSON.stringify({
    format: "svml.runtime-config@1",
    services: [],
    endpoints: [{
      use: "@svml/provider-kie",
      instance: "kie.cli-test",
      lane: "generation",
      config: { apiKeyEnv: "KIE_API_KEY", defaultConcurrency: 2 },
    }],
    permissions: ["network:api.kie.ai", "network:kieai.redpandaai.co"],
    scheduling: { lanes: { generation: 2 } },
  }), "utf8");
  let output = "";
  await runCli(["status", "missing-build", "--runtime", profile], {
    write: (text) => { output += text; },
  });
  const status = JSON.parse(output) as { readonly operations: readonly unknown[] };
  assert.deepEqual(status.operations, []);
});

test("official prelude lowers Speech Spine and explicit WhisperX alignment without provider calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-speech-spine-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<svml>
    <import from="@svml/script@1"/>
    <import as="seedance" from="@svml/seedance@1"/>
    <import as="speech" from="@svml/speech@1"/>
    <import as="whisperx" from="@svml/whisperx@1"/>
    <script id="story"><opening><HOST>Meaning becomes the source.</opening></script>
    <seedance:Prompt id="direction">Locked medium close-up.</seedance:Prompt>
    <seedance:Speech id="take" model="mini" dialogue={story.segment.opening.dialogue}
      prompt={direction} duration="5"/>
    <speech:Spine id="speech">
      <speech:Take source={take} segment={story.segment.opening}/>
    </speech:Spine>
    <whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>
  </svml>`, "utf8");
  let output = "";
  await runCli(["check", file], { write: (text) => { output += text; } });
  const checked = JSON.parse(output) as { readonly exports: readonly { readonly name: string }[] };
  assert.equal(checked.exports.some((item) => item.name === "speech.visual"), true);
  assert.equal(checked.exports.some((item) => item.name === "timing.map"), true);
});

test("Caption Gemini Surface lowers immutable display-atom runs into one explicit planning Need", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-caption-gemini-"));
  const file = join(root, "main.svml");
  await writeFile(join(root, "studio.svs"), `<sheet version="1">
    caption.base { stack-order: 70; x: 0.08; y: 0.76; width: 0.84; font: Inter;
      weight: 600; size: 58; line-height: 1; align: center; fill: #FFFFFF;
      background: #09090BCC; padding: 16 24; radius: 18; }
  </sheet>`, "utf8");
  await writeFile(file, `<svml>
    <import from="@svml/script@1"/>
    <import as="caption" from="@svml/caption@1"/>
    <import as="gemini" from="@svml/caption-gemini@1"/>
    <import as="studio" from="./studio.svs" using="@svml/svs@1"/>
    <script id="story"><dialogue><ALICE>Meaning becomes the source.<BOB>Then the graph stays explicit.</dialogue></script>
    <caption:Style id="plain" appearance={studio.caption.base}>
      <caption:Cues>Prefer short complete semantic phrases. Never cross clause punctuation.</caption:Cues>
    </caption:Style>
    <caption:Style id="emphasis" appearance={studio.caption.base}>
      <caption:Cues>Prefer short complete semantic phrases. Never cross clause punctuation.</caption:Cues>
      <caption:Field id="important" type="boolean" min-per-cue="0" max-per-cue="2">
        Select zero, one, or two words whose emphasis best communicates this Cue.
      </caption:Field>
    </caption:Style>
    <caption:Program id="caption-program" narrative={story} default={plain}>
      <caption:Use role="ALICE" style={emphasis}/>
    </caption:Program>
    <gemini:Planner id="dialogue-plan" narrative={story} program={caption-program} model="gemini-2.5-flash"/>
  </svml>`, "utf8");
  let checkedOutput = "";
  await runCli(["check", file], { write: (text) => { checkedOutput += text; } });
  const checked = JSON.parse(checkedOutput) as { readonly exports: readonly { readonly name: string }[] };
  assert.equal(checked.exports.some((item) => item.name === "caption-program"), true);
  assert.equal(checked.exports.some((item) => item.name === "dialogue-plan.plan"), true);
  let planOutput = "";
  await runCli(["plan", file, "--target", "dialogue-plan.plan"], { write: (text) => { planOutput += text; } });
  const plan = JSON.parse(planOutput) as { readonly steps: readonly { readonly producer: { readonly name: string } }[] };
  assert.deepEqual(plan.steps.map((step) => step.producer.name).sort(), [
    "compile-caption-gemini-request",
    "request-caption-gemini-plan",
  ].sort());
});

test("Track Surfaces close one complete author graph before any external execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-complete-author-"));
  const file = join(root, "main.svml");
  await writeFile(join(root, "studio.svs"), `<sheet version="1">
    film.vertical { width: 1080; height: 1920; frame-rate: 30; background: #09090B; }
    broll.card { stack-order: 40; x: 0.1; y: 0.2; width: 0.8; height: 0.5; fit: cover;
      background: #111116; radius: 20; enter: slide-up 4f; exit: fade 4f; }
    caption.base { stack-order: 70; x: 0.08; y: 0.76; width: 0.84; font: Inter;
      weight: 600; size: 58; line-height: 1; align: center; fill: #FFFFFF;
      background: #09090BCC; padding: 16 24; radius: 18; }
    text.title { stack-order: 90; x: 0.06; y: 0.06; width: 0.88; height: 0.1;
      font: Inter; weight: 900; size: 64; align: center; fill: #FFFFFF; tracking: -1; }
  </sheet>`, "utf8");
  await writeFile(file, `<svml>
    <import from="@svml/script@1"/>
    <import as="seedance" from="@svml/seedance@1"/>
    <import as="speech" from="@svml/speech@1"/>
    <import as="whisperx" from="@svml/whisperx@1"/>
    <import as="broll" from="@svml/broll@1"/>
    <import as="caption" from="@svml/caption@1"/>
    <import as="caption-ai" from="@svml/caption-gemini@1"/>
    <import as="text" from="@svml/text-track@1"/>
    <import as="film" from="@svml/film@1"/>
    <import as="render" from="@svml/hyperframes-render@1"/>
    <import as="studio" from="./studio.svs" using="@svml/svs@1"/>
    <script id="story"><opening><HOST>Meaning @demo becomes the source @/demo.</opening></script>
    <seedance:Prompt id="direction">Locked medium close-up.</seedance:Prompt>
    <seedance:Speech id="take" model="mini" dialogue={story.segment.opening.dialogue} prompt={direction} duration="5"/>
    <seedance:Video id="motion" model="mini" prompt={direction} duration="5"/>
    <speech:Spine id="speech"><speech:Take source={take} segment={story.segment.opening}/></speech:Spine>
    <whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>
    <caption:Style id="base-caption" appearance={studio.caption.base}>
      <caption:Cues>Prefer short complete semantic phrases.</caption:Cues>
      <caption:Field id="important" type="boolean" min-per-cue="0" max-per-cue="2">
        Select zero, one, or two words whose emphasis best communicates this Cue.
      </caption:Field>
    </caption:Style>
    <caption:Program id="caption-program" narrative={story} default={base-caption}/>
    <caption-ai:Planner id="cue-plan" narrative={story} program={caption-program} model="gemini-2.5-flash"/>
    <broll:Track id="cards" map={timing.map}>
      <broll:Item source={motion.video} during={story.selection.demo} appearance={studio.broll.card}/>
    </broll:Track>
    <caption:Track id="captions" narrative={story} map={timing.map} plan={cue-plan.plan} program={caption-program}/>
    <text:Track id="titles" space={speech.space}>
      <text:Item text="MEANING" during="full" appearance={studio.text.title}/>
    </text:Track>
    <film:Film id="main" space={speech.space} appearance={studio.film.vertical}>
      <film:Track source={speech.visual}/><film:Track source={speech.audioTrack}/>
      <film:Track source={cards.visual}/><film:Track source={captions.track}/><film:Track source={titles.track}/>
    </film:Film>
    <render:Video id="final" composition={main.composition}/>
  </svml>`, "utf8");
  let output = "";
  await runCli(["check", file], { write: (text) => { output += text; } });
  const checked = JSON.parse(output) as { readonly exports: readonly { readonly name: string }[] };
  for (const name of ["story.selection.demo", "cue-plan.plan", "cards.visual", "captions.track", "titles.track", "final.video"]) {
    assert.equal(checked.exports.some((item) => item.name === name), true, name);
  }
});

test("official v2 CLI closes the explicit HyperFrames render package without loading a Provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-render-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<svml>
    <import as="render" from="@svml/hyperframes-render@1"/>
  </svml>`, "utf8");
  let output = "";
  await runCli(["check", file], { write: (text) => { output += text; } });
  const result = JSON.parse(output) as {
    readonly ok: boolean;
    readonly modules: readonly string[];
    readonly exports: readonly unknown[];
  };
  assert.equal(result.ok, true);
  assert.deepEqual([...result.modules].sort(), [
    "@svml/artifact@0.0.0-dev",
    "@svml/composition@0.0.0-dev",
    "@svml/hyperframes-render@0.0.0-dev",
    "@svml/hyperframes@0.0.0-dev",
    "@svml/media-pipeline@0.0.0-dev",
    "@svml/media@0.0.0-dev",
    "@svml/narrative@0.0.0-dev",
    "@svml/program-space@0.0.0-dev",
    "@svml/speech@0.0.0-dev",
  ]);
  assert.deepEqual(result.exports, []);
});

test("CLI package lock activates an installed package without changing the official host", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-package-lock-"));
  const packageRoot = join(root, "node_modules", "example-empty");
  await mkdir(packageRoot, { recursive: true });
  const implementationDigest = `sha256:${"2".repeat(64)}`;
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-empty",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    svml: { activation: "./activation.mjs" },
  }), "utf8");
  await writeFile(join(packageRoot, "activation.mjs"), `
    const module = { name: "example.empty", version: "1" };
    const digest = ${JSON.stringify(implementationDigest)};
    export default {
      format: "svml.node-package@1",
      name: "example-empty",
      modules: [{ manifest: {
        format: "svml.module@0", name: module.name, version: module.version,
        dependencies: [], types: [], capabilities: [], producers: [],
        surfaces: [{ name: "empty", tag: "Empty", mode: "structured", outputs: [],
          implementation: { kind: "trusted-frontend-surface", locator: "example/empty", digest } }],
      }, specifiers: ["example.empty@1"] }],
      hostFacets: [{
        abi: "svml.text-surface-host@1",
        identity: { contract: "svml.text-surface-host-facet@1", module, surface: "empty",
          mode: "structured", implementationDigest: digest },
        implementation() { return { records: [], components: [], fragments: [] }; },
      }],
    };
  `, "utf8");
  const file = join(root, "main.svml");
  const lockPath = join(root, "svml.packages.lock");
  await writeFile(file, `<svml>
    <import as="example" from="example.empty@1"/>
    <example:Empty/>
  </svml>`, "utf8");

  await assert.rejects(
    async () => await runCli(["check", file, "--root", root], { write() {} }),
    /No registered module satisfies example\.empty@1/,
  );

  let lockOutput = "";
  await runCli(["lock-packages", lockPath, "--package", "example-empty", "--root", root], {
    write: (text) => { lockOutput += text; },
  });
  assert.equal(JSON.parse(lockOutput).ok, true);

  let checkOutput = "";
  await runCli(["check", file, "--package-lock", lockPath, "--root", root], {
    write: (text) => { checkOutput += text; },
  });
  const checked = JSON.parse(checkOutput) as { readonly ok: boolean; readonly modules: readonly string[] };
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.modules, ["example.empty@1"]);
});

test("materializeRecord copies an archived Artifact without requiring a completed Build", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-get-"));
  const bytes = Buffer.from("final-video-bytes");
  const artifactDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const output = join(root, "out", "final.mp4");
  const runtime = {
    async readArtifact(digest: string) { return digest === artifactDigest ? bytes : undefined; },
  } as Parameters<typeof materializeRecord>[0];
  const record = {
    id: "final.video",
    value: { kind: "inline", value: { digest: artifactDigest, size: bytes.byteLength, mediaType: "video/mp4" } },
  } as unknown as Parameters<typeof materializeRecord>[1];
  const result = await materializeRecord(runtime, record, output);
  assert.deepEqual(await readFile(output), bytes);
  assert.deepEqual(result, {
    kind: "artifact",
    path: output,
    digest: artifactDigest,
    size: bytes.byteLength,
    mediaType: "video/mp4",
  });
});

test("materializeRecord writes structured intermediate facts as JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-get-json-"));
  const output = join(root, "evidence.json");
  const record = {
    id: "whisperx.evidence",
    value: { kind: "inline", value: { words: [{ text: "hello", start: 0, end: 0.4 }] } },
  } as unknown as Parameters<typeof materializeRecord>[1];
  const result = await materializeRecord({ async readArtifact() { return undefined; } }, record, output);
  assert.equal(result.kind, "json");
  if (record.value.kind !== "inline") assert.fail("fixture must be inline");
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), record.value.value);
});

test("CLI inspect and get read the durable Build archive independently of build execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-archive-"));
  const runtimePath = join(root, "runtime.mjs");
  const destination = join(root, "final.mp4");
  const rawDestination = join(root, "whisperx-raw.json");
  const bytes = Buffer.from("archived-video");
  const rawBytes = Buffer.from('{"segments":[]}');
  const artifactDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const rawDigest = `sha256:${createHash("sha256").update(rawBytes).digest("hex")}`;
  const recordDigest = `sha256:${"1".repeat(64)}`;
  const buildDigest = `sha256:${"2".repeat(64)}`;
  const requestDigest = `sha256:${"3".repeat(64)}`;
  const state = {
    id: buildDigest,
    status: "active",
    graph: { id: `sha256:${"4".repeat(64)}` },
    request: {
      digest: requestDigest,
      targets: [{ output: "logical:final", accepts: "exact" }],
    },
    plan: {
      goals: [{ record: "record:final" }],
      selections: [{
        output: "logical:final",
        candidate: "candidate:render",
        fidelity: "exact",
        record: "record:final",
      }],
    },
    records: [{
      id: "record:final",
      type: { module: { name: "example", version: "1" }, name: "Artifact" },
      value: { kind: "inline", value: { digest: artifactDigest, size: bytes.byteLength, mediaType: "video/mp4" } },
      digest: recordDigest,
      conformance: "exact",
      origin: { kind: "authored", module: "example" },
    }, {
      id: "record:whisperx",
      type: { module: { name: "example", version: "1" }, name: "Evidence" },
      value: { kind: "inline", value: {
        words: [],
        rawEvidenceArtifact: { kind: "blob", digest: rawDigest, size: rawBytes.byteLength, mediaType: "application/json" },
      } },
      digest: `sha256:${"5".repeat(64)}`,
      conformance: "exact",
      origin: { kind: "authored", module: "example" },
    }],
    receipts: [],
    derivations: [],
    diagnostics: [],
  };
  const catalog = {
    format: "svml.build-catalog-descriptor@1",
    build: "archive-1",
    core: buildDigest,
    source: { path: join(root, "main.svml"), closure: `sha256:${"6".repeat(64)}` },
    run: { path: join(root, "delivery.svrun"), targetSet: "delivery" },
    aliases: [{
      name: "final.video",
      type: state.records[0]!.type,
      ref: { kind: "logical-output", id: "logical:final" },
    }, {
      name: "timing.rawEvidence",
      type: state.records[1]!.type,
      ref: { kind: "record", id: "record:whisperx" },
    }],
    createdAt: 100,
    updatedAt: 100,
  };
  await writeFile(runtimePath, `const bytes = Buffer.from(${JSON.stringify(bytes.toString("base64"))}, "base64");
const rawBytes = Buffer.from(${JSON.stringify(rawBytes.toString("base64"))}, "base64");
const catalog = ${JSON.stringify(catalog)};
export default {
  async build() { throw new Error("not used"); },
  async builds() { return [catalog]; },
  async status(id) { return { build: id === "archive-1" ? { build: id, revision: 7, state: ${JSON.stringify(state)} } : undefined, catalog: id === "archive-1" ? catalog : undefined, operations: [] }; },
  async readArtifact(digest) {
    if (digest === ${JSON.stringify(artifactDigest)}) return bytes;
    if (digest === ${JSON.stringify(rawDigest)}) return rawBytes;
    return undefined;
  },
  async close() {},
};\n`, "utf8");

  let inspectedOutput = "";
  await runCli(["inspect", "archive-1", "--runtime", runtimePath], {
    write: (text) => { inspectedOutput += text; },
  });
  const inspected = JSON.parse(inspectedOutput) as {
    readonly archive: {
      readonly status: string;
      readonly targets: readonly { readonly accepted: boolean }[];
      readonly records: readonly { readonly artifacts: readonly { readonly digest: string }[] }[];
      readonly presentation: { readonly aliases: readonly { readonly name: string; readonly accepted: boolean }[] };
    };
  };
  assert.equal(inspected.archive.status, "active");
  assert.equal(inspected.archive.targets[0]?.accepted, true);
  assert.equal(inspected.archive.records[0]?.artifacts[0]?.digest, artifactDigest);
  assert.deepEqual(inspected.archive.presentation.aliases.map((item) => [item.name, item.accepted]), [
    ["final.video", true],
    ["timing.rawEvidence", true],
  ]);

  let buildsOutput = "";
  await runCli(["builds", "--runtime", runtimePath], { write: (text) => { buildsOutput += text; } });
  const listed = JSON.parse(buildsOutput) as {
    readonly builds: readonly {
      readonly build: string;
      readonly aliasCount: number;
      readonly targets: readonly string[];
    }[];
  };
  assert.deepEqual(listed.builds, [{
    build: "archive-1",
    core: buildDigest,
    createdAt: 100,
    updatedAt: 100,
    status: "active",
    source: catalog.source,
    run: catalog.run,
    aliasCount: 2,
    targets: ["final.video"],
  }]);

  let statusOutput = "";
  await runCli(["status", "archive-1", "--runtime", runtimePath], {
    write: (text) => { statusOutput += text; },
  });
  const status = JSON.parse(statusOutput) as {
    readonly catalog: { readonly aliasCount: number; readonly targets: readonly string[] };
  };
  assert.deepEqual(status.catalog, {
    source: catalog.source,
    run: catalog.run,
    aliasCount: 2,
    targets: ["final.video"],
  });

  let getOutput = "";
  await runCli([
    "get", "archive-1", "--runtime", runtimePath,
    "--name", "final.video", "--to", destination,
  ], { write: (text) => { getOutput += text; } });
  assert.deepEqual(await readFile(destination), bytes);
  const got = JSON.parse(getOutput) as { readonly materialized: { readonly kind: string; readonly digest: string } };
  assert.equal(got.materialized.kind, "artifact");
  assert.equal(got.materialized.digest, artifactDigest);

  await runCli([
    "get", "archive-1", "--runtime", runtimePath,
    "--artifact", rawDigest, "--to", rawDestination,
  ], { write() {} });
  assert.deepEqual(await readFile(rawDestination), rawBytes);
});
