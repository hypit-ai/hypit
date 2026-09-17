import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { mediaTypes, verifyRenderedVisual } from "@hypit/media";
import type { CompositableSurfaceRef, RenderedVisual } from "@hypit/media";
import { sealProgramSpace } from "@hypit/program-space";
import { sealComposition, sealVisualTrack } from "@hypit/composition";
import assert from "node:assert/strict";
import { MemoryResourceStore, EndpointRegistry } from "@hypit/driver-node";
import type { EndpointRegistration } from "@hypit/driver-node";
import type { ImmediateEndpointHandler } from "@hypit/endpoint-kit";
import { compileHyperframesDocument } from "@hypit/hyperframes";
import { renderHyperframesCapabilities, hyperframesVisualRequest } from "@hypit/render-hyperframes";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue, Need } from "@hypit/protocol";

import { createLocalHyperframesProvider } from "../src/index.js";
import { localHyperframesBrowserProgram } from "../src/program.js";

const liveEnabled = process.env.HYPIT_BROWSER_TESTS === "1";
const hasFfprobe = spawnSync("ffprobe", ["-version"], { stdio: "ignore", windowsHide: true }).status === 0;

function documentFixture(surface?: CompositableSurfaceRef) {
  const programSpace = sealProgramSpace({ id: "test-space", durationSec: 1,
    frameRate: { numerator: 12, denominator: 1 },
  });
  const track = sealVisualTrack({ programSpaceId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "provider-fixture",
    presents: [{
      id: "card",
      span: { startFrame: 0, endFrameExclusive: 12 },
      stacking: { order: 10, tieBreak: "card" },
      elements: [
        {
          id: "background",
          order: 0,
          kind: "box",
          style: [
            { name: "position", value: "absolute" },
            { name: "inset", value: 0 },
            { name: "background", value: "#261447" },
          ],
        },
        ...(surface === undefined ? [] : [{
          id: "surface",
          parent: "background",
          order: 1,
          kind: "surface" as const,
          surface,
          style: [
            { name: "position" as const, value: "absolute" },
            { name: "left" as const, value: "0px" },
            { name: "top" as const, value: "0px" },
            { name: "width" as const, value: "1px" },
            { name: "height" as const, value: "1px" },
          ],
        }]),
      ],
    }],
  });
  return compileHyperframesDocument(sealComposition({
    id: "local-hyperframes-provider-fixture",
    canvas: { width: 160, height: 96, clearColor: "#000000" },
    tracks: [track],
  }), programSpace);
}

function requestNeed(document = documentFixture()): Need {
  const constraints = hyperframesVisualRequest(document);
  return {
    id: "need:local-hyperframes-fixture",
    capability: renderHyperframesCapabilities.renderVisual,
    returns: mediaTypes.renderedVisual,
    constraints,
    result: "record:local-hyperframes-fixture",
  };
}

async function handlerFor(request: Need): Promise<{
  readonly handler: ImmediateEndpointHandler;
  readonly registration: EndpointRegistration;
}> {
  const registry = new EndpointRegistry();
  await createLocalHyperframesProvider({
    workers: 2,
    defaultConcurrency: 1,
    processTimeoutMs: 120_000,
  }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  return { handler: resolution.registration.handler, registration: resolution.registration };
}

test("local HyperFrames Provider exposes one exact visual capability and two separate concurrency levels", async () => {
  const provider = createLocalHyperframesProvider({ workers: 4, defaultConcurrency: 2 });
  assert.equal(provider.instance.id, "hyperframes.local");
  assert.deepEqual(provider.offers, [{
    capability: renderHyperframesCapabilities.renderVisual,
    returns: mediaTypes.renderedVisual,
    endpoint: "hyperframes.local",
  }]);
  const resolved = await handlerFor(requestNeed());
  assert.equal(resolved.registration.scheduling?.resources.find((item) =>
    item.id.startsWith("pool:"))?.limit, 1,
    "Runtime request admission must remain separate from HyperFrames frame workers");
});

test("the selected HyperFrames Provider owns one idempotent browser installation", () => {
  const program = localHyperframesBrowserProgram({
    id: "hyperframes",
    nodePath: process.execPath,
    hyperframesCliPath: "/hyperframes-cli.js",
    engineModule: import.meta.resolve("@hyperframes/engine"),
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "hyperframes");
  assert.equal(program.start, undefined);
  assert.deepEqual(program.installation?.commands[0]?.args.slice(-2), ["browser", "ensure"]);
});

/** A stand-in engine whose browser resolution the probe must follow, not second-guess. */
async function engineStub(root: string, resolves: string | undefined): Promise<string> {
  const file = join(root, "engine.mjs");
  await writeFile(file, `export function resolveHeadlessShellPath() { return ${JSON.stringify(resolves)}; }
`);
  return pathToFileURL(file).href;
}

test("the browser probe reports what the engine will launch, not what a system Chrome offers", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-browser-probe-"));
  try {
    const probe = async (engineModule: string) => localHyperframesBrowserProgram({
      id: "hyperframes", nodePath: process.execPath, hyperframesCliPath: "/hyperframes-cli.js", engineModule, ffprobePath: "ffprobe",
    }).installation!.probe();

    // The engine names a runnable executable: ready, whatever else is on the machine.
    assert.deepEqual(await probe(await engineStub(root, process.execPath)), { state: "ready" });

    // The engine names a cached build that has since disappeared.
    const missing = join(root, "chrome-headless-shell", "chrome-headless-shell");
    const stale = await probe(await engineStub(root, missing));
    assert.equal(stale.state, "down");
    assert.match(stale.detail ?? "", /no rendering browser installed at .*chrome-headless-shell/u);
    assert.match(stale.detail ?? "", /hyperframes browser ensure/u);

    // The engine finds no managed build and its puppeteer fallback is not installed either.
    const none = await probe(await engineStub(root, undefined));
    assert.equal(none.state, "down");
    assert.match(none.detail ?? "", /no rendering browser installed; the render engine launches its managed chrome-headless-shell, not a system Chrome/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the browser probe follows the real engine's resolution", { skip: !liveEnabled }, async () => {
  const program = localHyperframesBrowserProgram({
    id: "hyperframes", nodePath: process.execPath, hyperframesCliPath: "/hyperframes-cli.js",
    engineModule: import.meta.resolve("@hyperframes/engine"), ffprobePath: "ffprobe",
  });
  assert.deepEqual(await program.installation!.probe(), { state: "ready" });
});

test("local HyperFrames Provider really renders a silent frame-exact MP4 with parallel workers", {
  skip: !liveEnabled || !hasFfprobe,
}, async () => {
  const resources = new MemoryResourceStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const surfaceArtifact = await resources.put(png, "image/png");
  const surface: CompositableSurfaceRef = {
    artifact: surfaceArtifact,
    width: 1,
    height: 1,
    colorSpace: "srgb",
    alphaMode: "straight",
    timing: { kind: "still" },
  };
  const request = requestNeed(documentFixture(surface));
  const { handler } = await handlerFor(request);
  const output = await handler({
    command: { kind: "fulfill-need", id: "command:local-hyperframes-fixture", need: request },
    need: request,
    resources,
    credentials: {},
  });
  assert.equal(output.value.kind, "inline");
  const value: CanonicalValue = output.value.kind === "inline" ? output.value.value : canonicalize(null);
  verifyRenderedVisual(value);
  const visual = value as unknown as RenderedVisual;
  assert.equal(visual.frameCount, 12);
  assert.deepEqual(visual.canvas, { width: 160, height: 96 });
  assert.equal(await resources.has(visual.artifact.resource), true);
});
