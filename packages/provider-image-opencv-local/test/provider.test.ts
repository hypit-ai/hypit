import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { artifactTypes } from "@narratage/artifact";
import { EndpointRegistry, MemoryArtifactStore } from "@narratage/driver-node";
import {
  gptImageDenoiseV1,
  imageTransformCapabilities,
  sealImageTransformProgram,
} from "@narratage/image-transform";
import type { ImageTransformProgram } from "@narratage/image-transform";
import {
  createLocalOpenCvImageProvider,
  localOpenCvImageProviderModuleRef,
} from "@narratage/provider-image-opencv-local";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { BlobRef, Need } from "@narratage/protocol";

function need(source: BlobRef, program: ImageTransformProgram = gptImageDenoiseV1): Need {
  const constraints = canonicalize({
    contract: "svml.image-transform-request@1",
    source,
    program,
  });
  return {
    id: "need:image-transform",
    capability: imageTransformCapabilities.transform,
    returns: artifactTypes.blob,
    constraints,
    requestedBy: "derivation:image-transform",
    result: "record:image-transform",
    accepts: "exact",
    conformanceFloor: "exact",
    requestDigest: digestOf({
      capability: imageTransformCapabilities.transform,
      returns: artifactTypes.blob,
      constraints,
    }),
  };
}

test("the OpenCV package is one replaceable Endpoint with no second queue", async () => {
  const provider = createLocalOpenCvImageProvider({ defaultConcurrency: 3 });
  assert.equal(provider.name, "image.opencv.local");
  const facet = provider.manifest.facets[0];
  assert(facet?.role === "capability-endpoint");
  assert.deepEqual(facet.permissions, ["process:image"]);
  assert.equal(facet.defaultConcurrency, 3);
  assert.deepEqual(provider.bindings, [{
    capability: imageTransformCapabilities.transform,
    returns: artifactTypes.blob,
    endpoint: "image.opencv.local",
  }]);
  assert.equal(provider.manifest.name, localOpenCvImageProviderModuleRef.name);
});

const liveEnabled = process.env.SVML_OPENCV_TESTS === "1";
const openCvPython = process.env.SVML_OPENCV_PYTHON ?? "python3";
const hasOpenCv = spawnSync(openCvPython, ["-c", "import cv2, numpy"], { stdio: "ignore" }).status === 0;

test("the local Provider returns only a new image BlobArtifact", {
  skip: !liveEnabled || !hasOpenCv,
}, async () => {
  const artifacts = new MemoryArtifactStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const source = await artifacts.put(png, "image/png");
  const program = sealImageTransformProgram({
    contract: "svml.image-transform-program@1",
    operations: [{
      kind: "resize",
      width: 64,
      height: 64,
      fit: "stretch",
      interpolation: "nearest",
    }, ...gptImageDenoiseV1.operations],
  });
  const request = need(source, program);
  const registry = new EndpointRegistry();
  await createLocalOpenCvImageProvider({ pythonExecutable: openCvPython }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({
    command: { kind: "fulfill-need", id: "command:image-transform", need: request },
    need: request,
    artifacts,
    credentials: {},
  });
  assert.equal(result.value.kind, "blob");
  assert.equal(result.value.mediaType, "image/png");
  assert.equal(await artifacts.has(result.value.digest), true);
  assert.deepEqual(Object.keys(result.value).sort(), ["digest", "kind", "mediaType", "size"]);
  const output = await artifacts.get(result.value.digest);
  assert(output !== undefined);
  const encoded = Buffer.from(output);
  assert.equal(encoded.readUInt32BE(16), 64);
  assert.equal(encoded.readUInt32BE(20), 64);
});
