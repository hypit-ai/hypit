import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import {
  diagnoseRuntimeExecutable,
  resolveRuntimeExecutable,
} from "@narratage/runtime-adapter-node";

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
    const configuredPython = runtimeConfigString(config.pythonExecutable, "OpenCV pythonExecutable");
    const pythonExecutable = configuredPython === undefined
      ? undefined
      : resolveRuntimeExecutable(context.root, configuredPython);
    return createLocalOpenCvImageProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(pythonExecutable === undefined ? {} : { pythonExecutable }),
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
    const config = runtimeConfigObject(context.config, "local OpenCV image");
    return await diagnoseRuntimeExecutable({
      root: context.root,
      configured: runtimeConfigString(config.pythonExecutable, "OpenCV pythonExecutable"),
      fallback: "python3",
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
