import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { artifactTypes } from "@narratage/artifact";
import { EndpointRegistry, MemoryArtifactStore } from "@narratage/driver-node";
import {
  gptImageDenoiseV1,
  sealImageTransformProgram,
} from "@narratage/image-transform";
import type { ImageTransformProgram } from "@narratage/image-transform";
import {
  createLocalOpenCvImageProvider,
  localOpenCvImageProviderModuleRef,
} from "@narratage/provider-image-opencv-local";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { BlobRef, Need } from "@narratage/protocol";
import { rasterCapabilities } from "@narratage/raster";

import { resolveLocalOpenCvDeployment } from "../src/deployment.js";
import { localOpenCvService } from "../src/service.js";

function need(source: BlobRef, program: ImageTransformProgram = gptImageDenoiseV1): Need {
  const constraints = canonicalize({
    contract: "svml.raster-request@1",
    kind: "transform",
    source,
    operations: program.operations,
  });
  return {
    id: "need:image-transform",
    capability: rasterCapabilities.execute,
    returns: artifactTypes.blob,
    constraints,
    requestedBy: "derivation:image-transform",
    result: "record:image-transform",
    requestDigest: digestOf({
      capability: rasterCapabilities.execute,
      returns: artifactTypes.blob,
      constraints,
    }),
  };
}

function composeNeed(source: BlobRef): Need {
  const constraints = canonicalize({
    contract: "svml.raster-request@1",
    kind: "compose",
    canvas: {
      widthPx: 3, heightPx: 2,
      origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
    },
    background: "#00000000",
    layers: [{
      source,
      frame: { xPx: 0, yPx: 0, widthPx: 3, heightPx: 2 },
      fit: "stretch", interpolation: "nearest", opacity: 1,
    }],
  });
  return {
    id: "need:image-compose", capability: rasterCapabilities.execute, returns: artifactTypes.blob,
    constraints, requestedBy: "derivation:image-compose", result: "record:image-compose",
    requestDigest: digestOf({ capability: rasterCapabilities.execute, constraints }),
  };
}

test("the OpenCV package is one replaceable Endpoint with no second queue", async () => {
  const provider = createLocalOpenCvImageProvider({ defaultConcurrency: 3 });
  assert.equal(provider.instance.id, "image.opencv.local");
  const facet = provider.manifest.facets[0];
  assert(facet?.role === "capability-endpoint");
  assert.equal(facet.defaultConcurrency, 3);
  assert.deepEqual(provider.bindings, [{
    capability: rasterCapabilities.execute,
    returns: artifactTypes.blob,
    endpoint: "image.opencv.local",
  }]);
  assert.equal(provider.manifest.name, localOpenCvImageProviderModuleRef.name);
});

test("managed and external OpenCV deployments never mix their interpreters", () => {
  const managedContext = { root: "/project", instance: "opencv", config: {} } as const;
  const managed = resolveLocalOpenCvDeployment(managedContext);
  assert.equal(managed.ownership, "managed");
  assert.match(managed.pythonExecutable, /services\/image-opencv\/\.venv\/(?:bin\/python|Scripts\/python\.exe)$/u);
  assert.deepEqual(managed.prepare?.args.slice(-1), ["--frozen"]);
  const managedService = localOpenCvService(managedContext);
  assert.deepEqual(managedService.prepare, managed.prepare);

  const externalContext = {
    root: "/project",
    instance: "opencv",
    config: { pythonExecutable: "./tools/python" },
  } as const;
  const external = resolveLocalOpenCvDeployment(externalContext);
  assert.equal(external.ownership, "external");
  assert.equal(external.pythonExecutable, "/project/tools/python");
  assert.equal(external.prepare, undefined);
  assert.equal(localOpenCvService(externalContext).prepare, undefined);
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

test("the local Provider composes ordered Layers into exact Canvas pixels", {
  skip: !liveEnabled || !hasOpenCv,
}, async () => {
  const artifacts = new MemoryArtifactStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const source = await artifacts.put(png, "image/png");
  const request = composeNeed(source);
  const registry = new EndpointRegistry();
  await createLocalOpenCvImageProvider({ pythonExecutable: openCvPython }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({
    command: { kind: "fulfill-need", id: "command:image-compose", need: request },
    need: request, artifacts, credentials: {},
  });
  assert.equal(result.value.kind, "blob");
  if (result.value.kind !== "blob") return;
  const output = await artifacts.get(result.value.digest);
  assert(output !== undefined);
  const probe = spawnSync(openCvPython, ["-c", [
    "import cv2, numpy as np, sys",
    "im=cv2.imdecode(np.frombuffer(sys.stdin.buffer.read(),np.uint8),cv2.IMREAD_UNCHANGED)",
    "print(im.shape[1], im.shape[0], im.shape[2], ','.join(map(str,im[0,0])))",
  ].join(";")], { input: Buffer.from(output), encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout.trim(), /^3 2 4 \d+,\d+,\d+,\d+$/u);
});
