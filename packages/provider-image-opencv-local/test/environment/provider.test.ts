import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { installEndpoint } from "@hypit/hypit/endpoint";

import { blobTypes } from "@hypit/blob";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/executor";
import { imageOperationsCapabilities, sealImageTransformProgram } from "@hypit/image-operations";
import type { ImageTransformProgram } from "@hypit/image-operations";
import { createLocalOpenCvImageProvider } from "@hypit/provider-image-opencv-local";
import { assertBlobRef, canonicalize } from "@hypit/protocol";
import type { BlobRef, Need } from "@hypit/protocol";

const openCvPython = process.env.HYPIT_OPENCV_PYTHON ?? "python3";

const denoiseProgram = sealImageTransformProgram({
  operations: [{
    kind: "denoise",
    method: "nlm-ycrcb",
    lumaStrength: 1,
    chromaStrength: 3,
    templateWindow: 7,
    searchWindow: 21,
    saturationRecovery: 1,
  }, {
    kind: "encode",
    format: "png",
  }],
});

function need(source: BlobRef, program: ImageTransformProgram = denoiseProgram): Need {
  return {
    id: "need:image-transform",
    capability: imageOperationsCapabilities.transform,
    returns: blobTypes.blob,
    constraints: canonicalize({ source, operations: program.operations }),
    result: "record:image-transform",
  };
}

function composeNeed(source: BlobRef): Need {
  return {
    id: "need:image-compose",
    capability: imageOperationsCapabilities.compose,
    returns: blobTypes.blob,
    constraints: canonicalize({
      canvas: { widthPx: 3, heightPx: 2 },
      background: "#00000000",
      layers: [{
        source,
        frame: { xPx: 0, yPx: 0, widthPx: 3, heightPx: 2 },
        fit: "stretch", interpolation: "nearest", opacity: 1,
      }],
    }),
    result: "record:image-compose",
  };
}

test("the local Provider returns only a new image Blob", async () => {
  const resources = new MemoryResourceStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const source = await resources.put(png, "image/png");
  const program = sealImageTransformProgram({
    operations: [{
      kind: "resize", width: 64, height: 64, fit: "stretch", interpolation: "nearest",
    }, ...denoiseProgram.operations],
  });
  const request = need(source, program);
  const registry = new EndpointRegistry();
  await installEndpoint(createLocalOpenCvImageProvider({ pythonExecutable: openCvPython }), registry);
  const resolution = registry.select(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({

    need: request, resources, credentials: {},
  });
  assertBlobRef(result);
  assert.equal(result.mediaType, "image/png");
  assert.equal(await resources.has(result.resource), true);
  const output = await resources.get(result.resource);
  assert(output !== undefined);
  const encoded = Buffer.from(output);
  assert.equal(encoded.readUInt32BE(16), 64);
  assert.equal(encoded.readUInt32BE(20), 64);
});

test("the local Provider composes ordered Layers into exact Canvas pixels", async () => {
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

    need: request, resources, credentials: {},
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
