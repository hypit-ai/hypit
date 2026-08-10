import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createNodePackageLock, writeNodePackageLock } from "@narratage/package-loader-node";
import { materializeRecord, runVideoCli } from "@narratage/video-cli";

import { videoTestPackages } from "./packages.js";

const runCli = (
  argv: readonly string[],
  io: { readonly write: (text: string) => void },
) => runVideoCli(argv, io, videoTestPackages);

test("production video CLI has no implicit author or Run packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-empty-distribution-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<?svml using="@narratage/markup@1"?>
<svml>
  <import from="@narratage/script@1"/>
  <script id="story"><opening><HOST>No hidden package.</opening></script>
</svml>`, "utf8");

  await assert.rejects(
    async () => await runVideoCli(["check", file], { write() {} }),
    /No registered module satisfies @narratage\/script@1/u,
  );
});

async function writeRun(
  root: string,
  name: string,
  targets: readonly { readonly output: string; readonly accepts?: "exact" | "substitute" }[],
): Promise<string> {
  const path = join(root, name);
  await writeFile(path, `<?svml using="@narratage/run-markup@1"?>
<svrun version="1" targets="selected">
  <author source="./main.svml"/>
  <target-set id="selected">
    ${targets.map((target) => `<target output="${target.output}" accepts="${target.accepts ?? "exact"}"/>`).join("\n    ")}
  </target-set>
</svrun>`, "utf8");
  return path;
}

test("official video CLI checks a real Script source through the Node compiler host", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-"));
  const file = join(root, "main.svml");
  await writeFile(join(root, "studio.svs"), `<?svml using="@narratage/svs@1"?>
<sheet version="1">
    caption.host {
      color: #ffffff;
      font-size: 72;
    }
  </sheet>`, "utf8");
  await writeFile(file, `<?svml using="@narratage/markup@1"?>
<svml>
    <import from="@narratage/script@1"/>
    <import as="studio" source="./studio.svs"/>
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
    "@narratage/narrative@1",
    "@narratage/script@1",
    "@narratage/svs@1",
    "@narratage/text@1",
  ]);
  assert.deepEqual(result.exports, [
    { name: "story", type: {
      module: { name: "@narratage/narrative", version: "1" },
      name: "Narrative",
    }, kind: "record" },
    { name: "story.caption", type: {
      module: { name: "@narratage/narrative", version: "1" },
      name: "CaptionDisplaySequence",
    }, kind: "record" },
    { name: "story.caption.correspondence", type: {
      module: { name: "@narratage/narrative", version: "1" },
      name: "CaptionCorrespondence",
    }, kind: "record" },
    { name: "story.segment.opening", type: {
      module: { name: "@narratage/narrative", version: "1" },
      name: "NarrativeExcerpt",
    }, kind: "record" },
    { name: "story.segment.opening.dialogue", type: {
      module: { name: "@narratage/text", version: "1" },
      name: "Text",
    }, kind: "record" },
    { name: "story.segment.opening.speech", type: {
      module: { name: "@narratage/text", version: "1" },
      name: "Text",
    }, kind: "record" },
  ]);
});

test("author source binds an ordered exact Font stack to a Fine Caption Style", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-caption-font-"));
  const file = join(root, "main.svml");
  const fontBytes = new Uint8Array([119, 79, 70, 50, 0, 1, 0, 0]);
  await writeFile(join(root, "caption.woff2"), fontBytes);
  await writeFile(join(root, "caption-fallback.woff2"), new Uint8Array([...fontBytes, 1]));
  await writeFile(join(root, "studio.svs"), `<?svml using="@narratage/svs@1"?>
<sheet version="1">
  caption.primary {
    cue-min-words: 1; cue-max-words: 4;
    stack-order: 20; x: 0.5; y: 0.9; width: 0.8;
    align: center; font: Studio Sans; weight: 600; size: 48; line-height: 1.1;
    fill: #ffffff; background: #00000000; padding: 0 0; radius: 0;
  }
</sheet>`, "utf8");
  await writeFile(file, `<?svml using="@narratage/markup@1"?>
<svml>
  <import as="media" from="@narratage/media@1"/>
  <import as="caption-fine" from="@narratage/caption-fine@1"/>
  <import as="studio" source="./studio.svs"/>

  <media:Font id="caption-font" src="./caption.woff2" weight="600" style="normal"/>
  <media:Font id="caption-fallback" src="./caption-fallback.woff2" weight="600" style="normal"/>
  <caption-fine:Style id="primary-caption" recipe={studio.caption.primary} font={caption-font}>
    <caption-fine:Fallback font={caption-fallback}/>
  </caption-fine:Style>
</svml>`, "utf8");

  let output = "";
  await runCli(["check", file], { write: (text) => { output += text; } });
  const result = JSON.parse(output) as {
    readonly ok: boolean;
    readonly exports: readonly { readonly name: string; readonly kind: string }[];
  };
  assert.equal(result.ok, true);
  assert.equal(result.exports.some((item) => item.name === "caption-font" && item.kind === "record"), true);
  assert.equal(result.exports.some((item) => item.name === "caption-fallback" && item.kind === "record"), true);
  assert.equal(result.exports.some((item) => item.name === "primary-caption" && item.kind === "record"), true);
});

test("an installed open-font package supplies a multilingual exact stack without system fonts", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-installed-fonts-"));
  const file = join(root, "main.svml");
  await writeFile(join(root, "studio.svs"), `<?svml using="@narratage/svs@1"?>
<sheet version="1">
  caption.primary {
    cue-min-words: 1; cue-max-words: 4;
    stack-order: 20; x: 0.5; y: 0.9; width: 0.8;
    align: center; font: Installed Open Stack; weight: 700; size: 48; line-height: 1.1;
    fill: #ffffff; background: #00000000; padding: 0 0; radius: 0;
  }
</sheet>`, "utf8");
  await writeFile(file, `<?svml using="@narratage/markup@1"?>
<svml>
  <import as="fonts" from="@narratage/fonts-open@1"/>
  <import as="caption-fine" from="@narratage/caption-fine@1"/>
  <import as="studio" source="./studio.svs"/>

  <fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal" emoji="color">
    <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
  </fonts:Stack>
  <caption-fine:Style id="primary-caption" recipe={studio.caption.primary} font={caption-fonts}/>
</svml>`, "utf8");

  let output = "";
  await runCli(["check", file], { write: (text) => { output += text; } });
  const result = JSON.parse(output) as {
    readonly ok: boolean;
    readonly exports: readonly { readonly name: string; readonly kind: string }[];
  };
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.exports.map((item) => item.name).sort(),
    ["caption-fonts", "primary-caption"],
  );
});

test("Text Template and exact Seedance keep speaker prompt assembly visible in the Run Graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-text-template-"));
  const file = join(root, "main.svml");
  const kitSource = await readFile(
    new URL("../../seedance-kits/kits/speaker-v1.svs", import.meta.url),
    "utf8",
  );
  await writeFile(join(root, "speaker-v1.svs"), kitSource, "utf8");
  await writeFile(join(root, "studio.svs"), `<?svml using="@narratage/svs@1"?>
<sheet version="1">
  speech.normal { language: en; pace: normal; min: 4; max: 15; rounding: round; }
  speaker.default {
    composition-stability: soft-locked; camera-motion: none;
    edit-rhythm: continuous-take; performance: natural-explainer; gesture: natural;
  }
</sheet>`, "utf8");
  await writeFile(join(root, "host.png"), new Uint8Array([137, 80, 78, 71]));
  await writeFile(file, `<?svml using="@narratage/markup@1"?>
<svml>
  <import from="@narratage/script@1"/>
  <import as="text" from="@narratage/text@1"/>
  <import as="media" from="@narratage/media@1"/>
  <import as="estimate" from="@narratage/estimate@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="studio" source="./studio.svs"/>
  <import as="speaker-kit" source="./speaker-v1.svs"/>

  <script id="story"><opening><HOST>Meaning becomes the source.</opening></script>
  <media:Image id="host" src="./host.png"/>
  <media:Audio id="voice" src="./voice.mp3"/>
  <text:Value id="action">Hold direct eye contact and use one compact gesture.</text:Value>
  <estimate:Speech id="duration" source={story.segment.opening.speech} policy={studio.speech.normal}/>
  <text:Render id="take-prompt" template={speaker-kit.speaker-v1} recipe={studio.speaker.default}>
    <text:Set name="dialogue" text={story.segment.opening.dialogue}/>
    <text:Set name="action" text={action}/>
  </text:Render>
  <seedance:ReferenceVideo id="take" model="mini" prompt={take-prompt}
    duration={duration.duration} resolution="720p" aspect-ratio="9:16" generate-audio="true">
    <seedance:Reference image={host}/>
    <seedance:Reference audio={voice}/>
  </seedance:ReferenceVideo>
</svml>`, "utf8");
  await writeFile(join(root, "voice.mp3"), new Uint8Array([73, 68, 51]));

  let checkedOutput = "";
  await runCli(["check", file], { write: (text) => { checkedOutput += text; } });
  const checked = JSON.parse(checkedOutput) as {
    readonly exports: readonly { readonly name: string }[];
  };
  const names = checked.exports.map((item) => item.name);
  assert.equal(names.includes("take-prompt"), true);
  assert.equal(names.includes("take.video"), true);

  const run = await writeRun(root, "build.svrun", [{ output: "take.video" }]);
  let planOutput = "";
  await runCli(["plan", run], { write: (text) => { planOutput += text; } });
  const plan = JSON.parse(planOutput) as {
    readonly steps: readonly { readonly producer: { readonly name: string } }[];
  };
  assert.deepEqual(plan.steps.map((step) => step.producer.name).sort(), [
    "bind-request-seedance-2-mini-referenceImage",
    "bind-request-seedance-2-mini-referenceAudio",
    "bind-request-seedance-2-mini-prompt-text",
    "bind-text",
    "bind-text",
    "compile-seedance-2-mini-duration-request",
    "estimate-speech-duration",
    "finalize-request-seedance-2-mini",
    "request-seedance-2-mini",
    "render",
    "select-primary-video",
  ].sort());
});

test("CLI accepts a declarative Runtime Profile without an executable config module", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-runtime-profile-"));
  const profile = join(root, "svml.runtime.json");
  const runtimePackageLock = join(root, "runtime.packages.lock.json");
  await writeNodePackageLock(
    runtimePackageLock,
    await createNodePackageLock(["@narratage/provider-kie"], process.cwd()),
  );
  await writeFile(profile, JSON.stringify({
    format: "svml.runtime-config@1",
    root: process.cwd(),
    statePath: join(root, "state.sqlite"),
    catalogPath: join(root, "catalog.sqlite"),
    artifactPath: join(root, "artifacts"),
    runtimePackageLock,
    endpoints: [{
      use: "@narratage/provider-kie",
      instance: "kie.cli-test",
      lane: "generation",
      config: { apiKeyEnv: "SVML_TEST_MISSING_KIE_KEY", defaultConcurrency: 2 },
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
  output = "";
  await runCli(["doctor", profile], { write: (text) => { output += text; } });
  const diagnosis = JSON.parse(output) as {
    readonly ok: boolean;
    readonly diagnostics: readonly { readonly code: string; readonly subject?: string }[];
  };
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.diagnostics.some((item) =>
    item.code === "RUNTIME_CREDENTIAL_MISSING" && item.subject === "SVML_TEST_MISSING_KIE_KEY"), true);
});

test("one checked-in fixture closes the complete provider-free video plan", async () => {
  const fixture = join(process.cwd(), "examples", "talking-film-graph-check");
  let output = "";
  await runCli([
    "plan",
    join(fixture, "build.svrun"),
    "--package-lock",
    join(fixture, "svml.packages.lock"),
    "--root",
    process.cwd(),
  ], { write: (text) => { output += text; } });
  const plan = JSON.parse(output) as {
    readonly goals: readonly unknown[];
    readonly steps: readonly {
      readonly fidelity: "exact" | "substitute";
      readonly producer: { readonly name: string };
    }[];
  };
  const producers = new Set(plan.steps.map((step) => step.producer.name));
  for (const name of [
    "request-seedance-2-mini",
    "assemble-speech-basis",
    "request-whisperx-alignment",
    "request-caption-gemini-plan",
    "request-media-inspection",
    "request-media-normalization",
    "project-media-visual-track",
    "render-fine-caption",
    "render-typography-track",
    "compile-composition",
    "request-visual-render",
    "request-audio-render",
    "request-media-mux",
    "project-muxed-media",
  ]) {
    assert.equal(producers.has(name), true, name);
  }
  assert.equal(plan.goals.length, 1);
  assert.equal(plan.steps.every((step) => step.fidelity === "exact"), true);
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
        format: "svml.module@1", name: module.name, version: module.version,
        dependencies: [], types: [], capabilities: [], producers: [],
        surfaces: [{ name: "empty", tag: "Empty", mode: "structured", outputs: [],
          implementation: { kind: "trusted-frontend-surface", locator: "example/empty", digest } }],
      }, specifiers: ["example.empty@1"] }],
      hostFacets: [{
        abi: "svml.markup-surface-host@1",
        identity: { contract: "svml.markup-surface-host-facet@1", module, surface: "empty",
          mode: "structured", implementationDigest: digest },
        implementation() { return { records: [], components: [], fragments: [] }; },
      }],
    };
  `, "utf8");
  const file = join(root, "main.svml");
  const lockPath = join(root, "svml.packages.lock");
  await writeFile(file, `<?svml using="@narratage/markup@1"?>
<svml>
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
