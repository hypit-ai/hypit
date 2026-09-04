import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import test from "node:test";

import { artifactTypes } from "@hypit/artifact";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import {
  gptImageDenoiseV1,
  sealImageTransformProgram,
} from "@hypit/image-transform";
import type { ImageTransformProgram } from "@hypit/image-transform";
import {
  createLocalOpenCvImageProvider,
  localOpenCvImageProviderModuleRef,
} from "@hypit/provider-image-opencv-local";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, Need } from "@hypit/protocol";
import { rasterCapabilities } from "@hypit/raster";

import { resolveLocalOpenCvDeployment } from "../src/deployment.js";
import { localOpenCvProgram } from "../src/program.js";

function need(source: BlobRef, program: ImageTransformProgram = gptImageDenoiseV1): Need {
  const constraints = canonicalize({
    kind: "transform",
    source,
    operations: program.operations,
  });
  return {
    id: "need:image-transform",
    capability: rasterCapabilities.execute,
    returns: artifactTypes.blob,
    constraints,
    result: "record:image-transform",
  };
}

function composeNeed(source: BlobRef): Need {
  const constraints = canonicalize({
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
    constraints, result: "record:image-compose",
  };
}

test("the OpenCV package is one replaceable Endpoint with no second queue", async () => {
  const provider = createLocalOpenCvImageProvider({ defaultConcurrency: 3 });
  assert.equal(provider.instance.id, "image.opencv.local");
  assert.deepEqual(provider.offers, [{
    capability: rasterCapabilities.execute,
    returns: artifactTypes.blob,
    endpoint: "image.opencv.local",
  }]);
});

test("managed and external OpenCV deployments never mix their interpreters", () => {
  const managedContext = { hostStateRoot: "/host", dataRoot: "/project", instance: "opencv" } as const;
  const managed = resolveLocalOpenCvDeployment(managedContext);
  assert.equal(managed.ownership, "managed");
  // The deployment already branches on the platform for the venv layout, so the tail it produces
  // is joined with the platform's separator too. Spell the separator as either one.
  assert.match(managed.pythonExecutable,
    /host[\\/]programs[\\/]image-opencv-opencv[\\/]\.venv[\\/](?:bin[\\/]python|Scripts[\\/]python\.exe)$/u);
  assert.deepEqual(managed.installCommands?.[0]?.args.slice(-1), ["--frozen"]);
  const managedProgram = localOpenCvProgram(managedContext.instance, managed);
  assert.deepEqual(managedProgram.installation?.commands, managed.installCommands);

  const externalContext = {
    hostStateRoot: "/host",
    dataRoot: "/project",
    instance: "opencv",
    pythonExecutable: "./tools/python",
  } as const;
  const external = resolveLocalOpenCvDeployment(externalContext);
  assert.equal(external.ownership, "external");
  assert.equal(external.pythonExecutable, resolve(join("/project", "tools", "python")));
  assert.equal(external.installCommands, undefined);
  assert.equal(localOpenCvProgram(externalContext.instance, external).installation, undefined);
});

const liveEnabled = process.env.HYPIT_OPENCV_TESTS === "1";
const openCvPython = process.env.HYPIT_OPENCV_PYTHON ?? "python3";
const hasOpenCv = spawnSync(openCvPython, ["-c", "import cv2, numpy"], { stdio: "ignore", windowsHide: true }).status === 0;

test("the local Provider returns only a new image BlobArtifact", {
  skip: !liveEnabled || !hasOpenCv,
}, async () => {
  const resources = new MemoryResourceStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const source = await resources.put(png, "image/png");
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
    resources,
    credentials: {},
  });
  assert.equal(result.value.kind, "blob");
  assert.equal(result.value.mediaType, "image/png");
  assert.equal(await resources.has(result.value.resource), true);
  const output = await resources.get(result.value.resource);
  assert(output !== undefined);
  const encoded = Buffer.from(output);
  assert.equal(encoded.readUInt32BE(16), 64);
  assert.equal(encoded.readUInt32BE(20), 64);
});

test("the local Provider composes ordered Layers into exact Canvas pixels", {
  skip: !liveEnabled || !hasOpenCv,
}, async () => {
  const resources = new MemoryResourceStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const source = await resources.put(png, "image/png");
  const request = composeNeed(source);
  const registry = new EndpointRegistry();
  await createLocalOpenCvImageProvider({ pythonExecutable: openCvPython }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({
    command: { kind: "fulfill-need", id: "command:image-compose", need: request },
    need: request, resources, credentials: {},
  });
  assert.equal(result.value.kind, "blob");
  if (result.value.kind !== "blob") return;
  const output = await resources.get(result.value.resource);
  assert(output !== undefined);
  const probe = spawnSync(openCvPython, ["-c", [
    "import cv2, numpy as np, sys",
    "im=cv2.imdecode(np.frombuffer(sys.stdin.buffer.read(),np.uint8),cv2.IMREAD_UNCHANGED)",
    "print(im.shape[1], im.shape[0], im.shape[2], ','.join(map(str,im[0,0])))",
  ].join(";")], { input: Buffer.from(output), encoding: "utf8", windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout.trim(), /^3 2 4 \d+,\d+,\d+,\d+$/u);
});
