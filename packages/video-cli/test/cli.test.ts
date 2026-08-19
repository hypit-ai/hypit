import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { materializeRecord, runVideoCli, videoCliDistribution } from "@hypit/video-cli";

import { videoTestPackages } from "./packages.js";

const runCli = (
  argv: readonly string[],
  io: { readonly write: (text: string) => void },
) => runVideoCli([...argv, "--json"], io, videoTestPackages);

test("source package selection follows Run and Author imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-package-selection-"));
  try {
    await writeFile(join(root, "style.svs"), `<?svml using="@hypit/svs@1"?>\n<sheet version="1"/>`, "utf8");
    await writeFile(join(root, "main.svml"), `<?svml using="@hypit/markup@1"?>
<svml>
  <import from="@hypit/script@1"/>
  <import as="style" source="./style.svs"/>
  <script id="story"><line><HOST>Hello.</line></script>
</svml>`, "utf8");
    const run = join(root, "build.svrun");
    await writeFile(run, `<?svml using="@hypit/run-markup@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="story"/>
</svrun>`, "utf8");
    const discovered = await videoCliDistribution.discoverSourcePackages!(run, {
      workspaceRoot: root,
      packages: videoTestPackages,
    });
    assert.deepEqual(discovered.selected, ["@hypit/run-markup", "@hypit/script", "@hypit/svs"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider-free example plans from installed Source packages", async () => {
  const fixture = join(process.cwd(), "examples", "talking-film-graph-check");
  let output = "";
  await runCli([
    "plan",
    join(fixture, "build.svrun"),
    "--workspace",
    process.cwd(),
  ], { write: (text) => { output += text; } });
  const plan = (JSON.parse(output) as { readonly plan: {
    readonly goals: readonly unknown[];
    readonly steps: readonly { readonly producer: { readonly name: string } }[];
  } }).plan;
  const producers = new Set(plan.steps.map((step) => step.producer.name));
  assert.equal(producers.has("assemble-speech-basis"), true);
  assert.equal(producers.has("compile-composition"), true);
  assert.equal(producers.has("project-muxed-media"), true);
  assert.equal(plan.goals.length, 1);
});

test("materializeRecord copies an archived Artifact without rerunning a Build", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-get-"));
  try {
    const bytes = Buffer.from("final-video-bytes");
    const artifactDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const output = join(root, "final.mp4");
    const runtime = {
      async openArtifact(digest: string) {
        return digest === artifactDigest ? (async function* () { yield bytes; })() : undefined;
      },
    } as Parameters<typeof materializeRecord>[0];
    const record = {
      id: "final.video",
      value: { kind: "inline", value: { digest: artifactDigest, size: bytes.byteLength, mediaType: "video/mp4" } },
    } as unknown as Parameters<typeof materializeRecord>[1];
    const result = await materializeRecord(runtime, record, output);
    assert.deepEqual(result, {
      kind: "artifact",
      digest: artifactDigest,
      mediaType: "video/mp4",
      size: bytes.byteLength,
      path: output,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
