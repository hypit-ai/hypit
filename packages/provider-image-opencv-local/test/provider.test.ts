import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";

import { blobTypes } from "@hypit/blob";
import {
  createLocalOpenCvImageProvider,
} from "@hypit/provider-image-opencv-local";
import { imageOperationsCapabilities } from "@hypit/image-operations";
import { endpointOffers } from "@hypit/hypit/endpoint";

import { resolveLocalOpenCvDeployment } from "../src/deployment.js";
import { localOpenCvProgram } from "../src/program.js";

test("the OpenCV package is one replaceable Endpoint with no second queue", async () => {
  const provider = createLocalOpenCvImageProvider({ defaultConcurrency: 3 });
  assert.equal(provider.instance.id, "image.opencv.local");
  assert.deepEqual(endpointOffers(provider), [{
    capability: imageOperationsCapabilities.transform,
    returns: blobTypes.blob,
    endpoint: "image.opencv.local",
  }, {
    capability: imageOperationsCapabilities.compose,
    returns: blobTypes.blob,
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
