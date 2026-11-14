import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";
import {
  diagnoseEnvironmentExecutable,
} from "@hypit/execution-environment-local/node";

import { resolveLocalOpenCvDeployment } from "./deployment.js";
import { createLocalOpenCvImageProvider } from "./provider.js";
import { localOpenCvProgram } from "./program.js";

const localOpenCvRuntimeAdapter = createExecutionEnvironmentEndpointAdapterFacet({
  use: "@hypit/provider-image-opencv-local",
  activate(context) {
    if (context.pool === undefined) throw new Error("local OpenCV Provider Pool is required");
    const config = executionEnvironmentConfigObject(context.config, "local OpenCV image");
    executionEnvironmentConfigExact(config, [
      "pythonExecutable", "defaultConcurrency", "processTimeoutMs", "maxInputBytes", "maxOutputBytes",
    ], "local OpenCV image");
    const configuredPython = executionEnvironmentConfigString(config.pythonExecutable, "OpenCV pythonExecutable");
    const deployment = resolveLocalOpenCvDeployment({
      hostStateRoot: context.hostStateRoot,
      dataRoot: context.dataRoot,
      instance: context.instance,
      ...(configuredPython === undefined ? {} : { pythonExecutable: configuredPython }),
    });
    const defaultConcurrency = executionEnvironmentConfigPositiveInteger(config.defaultConcurrency, "OpenCV defaultConcurrency");
    const processTimeoutMs = executionEnvironmentConfigPositiveInteger(config.processTimeoutMs, "OpenCV processTimeoutMs");
    const maxInputBytes = executionEnvironmentConfigPositiveInteger(config.maxInputBytes, "OpenCV maxInputBytes");
    const maxOutputBytes = executionEnvironmentConfigPositiveInteger(config.maxOutputBytes, "OpenCV maxOutputBytes");
    return {
      endpoint: createLocalOpenCvImageProvider({
        instance: context.instance,
        pool: context.pool,
        pythonExecutable: deployment.pythonExecutable,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(processTimeoutMs === undefined ? {} : { processTimeoutMs }),
        ...(maxInputBytes === undefined ? {} : { maxInputBytes }),
        ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }),
      }),
      program: localOpenCvProgram(context.instance, deployment),
      diagnose: () => diagnoseEnvironmentExecutable({
        root: context.dataRoot,
        configured: deployment.pythonExecutable,
        fallback: deployment.pythonExecutable,
        subject: "OpenCV Python",
      }),
    };
  },
});

export const hypitPackage = {
  facets: [localOpenCvRuntimeAdapter],
};

export default hypitPackage;
