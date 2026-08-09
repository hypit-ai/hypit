import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import {
  diagnoseRuntimeExecutable,
} from "@narratage/runtime-adapter-node";

import { resolveLocalOpenCvDeployment } from "./deployment.js";
import { createLocalOpenCvImageProvider } from "./provider.js";
import { localOpenCvService } from "./service.js";

const localOpenCvRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-image-opencv-local",
  validate(context) {
    const config = runtimeConfigObject(context.config, "local OpenCV image");
    runtimeConfigExact(config, [
      "pythonExecutable", "defaultConcurrency", "processTimeoutMs", "maxInputBytes", "maxOutputBytes",
    ], "local OpenCV image");
    runtimeConfigString(config.pythonExecutable, "OpenCV pythonExecutable");
    runtimeConfigPositiveInteger(config.defaultConcurrency, "OpenCV defaultConcurrency");
    runtimeConfigPositiveInteger(config.processTimeoutMs, "OpenCV processTimeoutMs");
    runtimeConfigPositiveInteger(config.maxInputBytes, "OpenCV maxInputBytes");
    runtimeConfigPositiveInteger(config.maxOutputBytes, "OpenCV maxOutputBytes");
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "local OpenCV image");
    runtimeConfigExact(config, [
      "pythonExecutable", "defaultConcurrency", "processTimeoutMs", "maxInputBytes", "maxOutputBytes",
    ], "local OpenCV image");
    const pythonExecutable = resolveLocalOpenCvDeployment(context).pythonExecutable;
    return createLocalOpenCvImageProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      pythonExecutable,
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "OpenCV defaultConcurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(runtimeConfigPositiveInteger(config.processTimeoutMs, "OpenCV processTimeoutMs") === undefined
        ? {} : { processTimeoutMs: config.processTimeoutMs as number }),
      ...(runtimeConfigPositiveInteger(config.maxInputBytes, "OpenCV maxInputBytes") === undefined
        ? {} : { maxInputBytes: config.maxInputBytes as number }),
      ...(runtimeConfigPositiveInteger(config.maxOutputBytes, "OpenCV maxOutputBytes") === undefined
        ? {} : { maxOutputBytes: config.maxOutputBytes as number }),
    });
  },
  async doctor(context) {
    const deployment = resolveLocalOpenCvDeployment(context);
    return await diagnoseRuntimeExecutable({
      root: context.root,
      configured: deployment.pythonExecutable,
      fallback: deployment.pythonExecutable,
      subject: "OpenCV Python",
    });
  },
  service: localOpenCvService,
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-image-opencv-local",
  hostFacets: [localOpenCvRuntimeAdapter],
};

export default svmlPackage;
