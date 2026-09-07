import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { OsCredentialStore } from "@hypit/credential-store-os";
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
  // The examples directory is intentionally kept empty; use the maintained package preview
  // fixture instead. It is a real installed Source package and exercises the same provider-free
  // planning path (semantic track, composition and mux projections).
  const fixture = join(process.cwd(), "packages", "media-track", "preview");
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
  assert.equal(producers.has("assemble-semantic-track"), true);
  assert.equal(producers.has("compile-composition"), true);
  assert.equal(producers.has("project-muxed-media"), true);
  assert.equal(plan.goals.length, 1);
});

/**
 * The command a package author uses for the package's own chrome. Every wire call is
 * answered locally: this test spends nothing and reaches no network.
 */
test("image writes one picture file with no Source, Build, Record or Runtime Profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-image-"));
  const pictureBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const calls: string[] = [];
  const requests: Record<string, unknown>[] = [];
  const idempotencyKeys = new Set<string>();
  const realFetch = globalThis.fetch;
  const realKey = process.env.HYPIHUB_API_KEY;
  const realOsResolve = OsCredentialStore.prototype.resolve;
  OsCredentialStore.prototype.resolve = async () => undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/v1/models/gpt-image-2-text-to-image")) {
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-image-key");
      return Response.json({ id: "gpt-image-2-text-to-image", endpoints: ["images"] });
    }
    if (url.endsWith("/v1/images/generations")) {
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-image-key");
      const key = new Headers(init?.headers).get("idempotency-key");
      assert.ok(key);
      if (idempotencyKeys.has(key)) {
        return Response.json({ error: { code: "idempotency_conflict" } }, { status: 409 });
      }
      idempotencyKeys.add(key);
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ id: "job_image_test", status: "queued" }, { status: 202 });
    }
    if (url.endsWith("/v1/jobs/job_image_test")) {
      return Response.json({ id: "job_image_test", status: "succeeded" });
    }
    if (url.endsWith("/v1/jobs/job_image_test/assets")) {
      return Response.json({ items: [{ url: "https://download.hypihub.test/paper.png" }] });
    }
    if (url === "https://download.hypihub.test/paper.png") {
      return new Response(pictureBytes, { status: 200, headers: { "content-type": "image/png" } });
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof globalThis.fetch;
  process.env.HYPIHUB_API_KEY = "test-image-key";
  try {
    const promptFile = join(root, "paper.txt");
    await writeFile(promptFile, "A sheet of warm cream laid paper, even lighting, no text.\n", "utf8");
    const destination = join(root, "assets", "paper.png");
    let output = "";
    await runCli([
      "image", "--prompt", promptFile, "--to", destination, "--aspect-ratio", "1:1",
    ], { write: (text) => { output += text; } });
    const machine = JSON.parse(output) as {
      readonly package: string; readonly model: string;
      readonly mediaType: string; readonly size: number; readonly path: string;
    };
    assert.equal(machine.package, "@hypit/gpt-image");
    assert.equal(machine.model, "gpt-image-2");
    assert.equal(machine.mediaType, "image/png");
    assert.equal(machine.size, pictureBytes.byteLength);
    assert.equal(machine.path, destination);
    assert.deepEqual(Uint8Array.from(await readFile(destination)), pictureBytes);
    // The author gave one option; every other port took the model's own first value.
    assert.deepEqual(requests, [{
      model: "gpt-image-2-text-to-image",
      prompt: "A sheet of warm cream laid paper, even lighting, no text.",
      aspect_ratio: "1:1",
      resolution: "1k",
    }]);
    assert.equal(calls.filter((item) => item.endsWith("/v1/images/generations")).length, 1);
    // A new invocation must remain a new paid operation when its image shape changes.
    const portrait = join(root, "assets", "portrait.png");
    await runCli([
      "image", "--prompt", promptFile, "--to", portrait,
      "--aspect-ratio", "9:16", "--resolution", "4K",
    ], { write: () => {} });
    assert.deepEqual(Uint8Array.from(await readFile(portrait)), pictureBytes);
    assert.deepEqual(requests[1], {
      model: "gpt-image-2-text-to-image",
      prompt: "A sheet of warm cream laid paper, even lighting, no text.",
      aspect_ratio: "9:16",
      resolution: "4k",
    });
    assert.equal(idempotencyKeys.size, 2);
  } finally {
    OsCredentialStore.prototype.resolve = realOsResolve;
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.HYPIHUB_API_KEY;
    else process.env.HYPIHUB_API_KEY = realKey;
    await rm(root, { recursive: true, force: true });
  }
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
