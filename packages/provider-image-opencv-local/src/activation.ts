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
import { localOpenCvProgram } from "./program.js";

const localOpenCvRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-image-opencv-local",
  activate(context) {
    if (context.authority === undefined) throw new Error("local OpenCV Provider Authority is required");
    const config = runtimeConfigObject(context.config, "local OpenCV image");
    runtimeConfigExact(config, [
      "pythonExecutable", "defaultConcurrency", "processTimeoutMs", "maxInputBytes", "maxOutputBytes",
    ], "local OpenCV image");
    runtimeConfigString(config.pythonExecutable, "OpenCV pythonExecutable");
    const deployment = resolveLocalOpenCvDeployment(context);
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "OpenCV defaultConcurrency");
    const processTimeoutMs = runtimeConfigPositiveInteger(config.processTimeoutMs, "OpenCV processTimeoutMs");
    const maxInputBytes = runtimeConfigPositiveInteger(config.maxInputBytes, "OpenCV maxInputBytes");
    const maxOutputBytes = runtimeConfigPositiveInteger(config.maxOutputBytes, "OpenCV maxOutputBytes");
    return {
      endpoint: createLocalOpenCvImageProvider({
        instance: context.instance,
        authority: context.authority,
        pythonExecutable: deployment.pythonExecutable,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(processTimeoutMs === undefined ? {} : { processTimeoutMs }),
        ...(maxInputBytes === undefined ? {} : { maxInputBytes }),
        ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }),
      }),
      program: localOpenCvProgram(context),
      diagnose: () => diagnoseRuntimeExecutable({
        root: context.dataRoot,
        configured: deployment.pythonExecutable,
        fallback: deployment.pythonExecutable,
        subject: "OpenCV Python",
      }),
    };
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  hostFacets: [localOpenCvRuntimeAdapter],
};

export default svmlPackage;
