import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { installEndpoint } from "@hypit/hypit/endpoint";

import { blobTypes } from "@hypit/blob";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/executor";
import { rasterCompositionCapabilities } from "@hypit/raster-composition";
import { createLocalOpenCvImageProvider } from "@hypit/provider-image-opencv-local";
import { assertBlobRef, canonicalize } from "@hypit/protocol";
import type { BlobRef, Need } from "@hypit/protocol";

const runtime = fileURLToPath(new URL("../../runtime/", import.meta.url));
const managedPython = process.platform === "win32"
  ? join(runtime, ".venv", "Scripts", "python.exe")
  : join(runtime, ".venv", "bin", "python");
const openCvPython = process.env.HYPIT_OPENCV_PYTHON ?? managedPython;

function composeNeed(source: BlobRef): Need {
  const target = { id: "output", region: { x: 0, y: 0, width: 3, height: 2 } } as const;
  return {
    id: "need:image-compose",
    capability: rasterCompositionCapabilities.render,
    returns: blobTypes.blob,
    constraints: canonicalize({
      target,
      background: "#00000000",
      layers: [{
        source,
        mapping: {
          target,
          source: { id: "source", region: { x: 0, y: 0, width: 1, height: 1 } },
          transform: { kind: "affine", xx: 1 / 3, xy: 0, yx: 0, yy: 1 / 2, tx: 0, ty: 0 },
        },
        interpolation: "nearest",
        opacity: 1,
      }],
    }),
    result: "record:image-compose",
  };
}

test("the local Provider samples ordered Layers through Spatial Maps", async () => {
  const resources = new MemoryResourceStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const source = await resources.put(png, "image/png");
  const request = composeNeed(source);
  const registry = new EndpointRegistry();
  await installEndpoint(createLocalOpenCvImageProvider({ pythonExecutable: openCvPython }), registry);
  const resolution = registry.select(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({

    request: request, resources, credentials: {},
  });
  assertBlobRef(result);
  const output = await resources.get(result.resource);
  assert(output !== undefined);
  const probe = spawnSync(openCvPython, ["-c", [
    "import cv2, numpy as np, sys",
    "im=cv2.imdecode(np.frombuffer(sys.stdin.buffer.read(),np.uint8),cv2.IMREAD_UNCHANGED)",
    "print(im.shape[1], im.shape[0], im.shape[2], ','.join(map(str,im[0,0])))",
  ].join(";")], { input: Buffer.from(output), encoding: "utf8", windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout.trim(), /^3 2 4 \d+,\d+,\d+,\d+$/u);
});
