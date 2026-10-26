import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { canonicalize } from "@hypit/protocol";
import { verifyHtmlFrameRequest } from "@hypit/html-program";
import type { CliRuntimeHost, CliRuntimeSelectionContext } from "@hypit/cli";
import { runSnapshotCli, studioDocumentUrl } from "../src/snapshot-cli.js";

test("snapshot --studio requires an absolute HTTP URL", () => {
  assert.equal(studioDocumentUrl("http://localhost:5191"), "http://localhost:5191/__studio/document");
  assert.equal(studioDocumentUrl("HTTPS://studio.example"), "https://studio.example/__studio/document");
  assert.throws(() => studioDocumentUrl("localhost:5191"), /--studio needs an http\(s\) Studio URL/u);
  assert.throws(() => studioDocumentUrl("file:///tmp/studio"), /--studio needs an http\(s\) Studio URL/u);
});

test("Studio snapshots pass one typed HTML Program and only its selected Artifacts", async t => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-studio-snapshot-"));
  const bytes = await sharp({ create: { width: 96, height: 64, channels: 3, background: "red" } }).png().toBuffer();
  const artifact = { kind: "blob" as const, resource: "res_program_image" as const, size: bytes.length, mediaType: "image/png" };
  const late = { kind: "blob" as const, resource: "res_late_image" as const, size: 123, mediaType: "image/png" };
  const program = { visualIr: "hypit.visual-ir@1", frameRate: { numerator: 30000, denominator: 1001 }, frameCount: 12,
    canvas: { width: 96, height: 64 }, artifacts: [
      { artifact: late, usage: { kind: "frames" as const, spans: [{ startFrame: 10, endFrameExclusive: 12 }] } },
      { artifact, usage: { kind: "always" as const } },
    ], surfaces: [], videoSources: [],
    html: '<!doctype html><div data-hypit-program-root data-hypit-frame-count="12"><script>const input="hypit-resource://res_program_image";</script><img data-hypit-resource-src="hypit-resource://res_late_image"></div>' };
  const fetched: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = String(input);
    fetched.push(url);
    if (url.endsWith("/__studio/document")) return Response.json(program);
    if (url.endsWith("/__studio/material/res_program_image")) return new Response(bytes);
    throw new Error(`Unexpected read ${url}`);
  });
  try {
    const host = {
      endpoints: async queries => queries.map(query => ({ need: query.need, capability: query.capability,
        status: "resolved", support: "supported", endpoint: "frames", use: "@example/frames" })),
      invoke: async (need, resources) => {
        assert.equal(need.capability.name, "rasterize-frames");
        verifyHtmlFrameRequest(need.constraints);
        assert.deepEqual(need.constraints.program, program);
        assert.deepEqual(need.constraints.picture, {
          colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8,
          alpha: { mode: "opaque", matte: "#000000" },
        });
        assert.deepEqual(need.constraints.frames, [3]);
        assert.deepEqual(Buffer.from((await resources.get(artifact.resource))!), bytes);
        return canonicalize({ picture: need.constraints.picture,
          frames: [{ frame: 3, artifact: await resources.put(bytes, "image/png") }] });
      },
    } as Pick<CliRuntimeHost, "endpoints" | "invoke">;
    const application: CliRuntimeSelectionContext = {
      cwd: directory,
      resolveProjectRoot: async () => directory,
      distribution: {
        resolveProjectRuntime: async () => ({ profile: "selected.json" }),
        openRuntimeHost: async () => host as CliRuntimeHost,
      },
    };
    let output = "";
    await runSnapshotCli(["snapshot", "--studio", "http://studio.example:5191/#comments", "--at-frame", "3", "--to", "evidence"],
      { write(text) { output += text; } }, application);
    assert.deepEqual(fetched, ["http://studio.example:5191/__studio/document", "http://studio.example:5191/__studio/material/res_program_image"]);
    assert.deepEqual(await readFile(join(directory, "evidence", "frame-000000003.png")), bytes);
    assert.deepEqual(await readdir(join(directory, "evidence")), ["frame-000000003.png"]);
    assert.match(output, /Captured 1 PNG/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
