import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigObject,
  runtimeConfigExact,
  runtimeConfigString,
  runtimeConfigCredentialRef,
  runtimeConfigPositiveInteger,
  runtimeConfigActionLimits,
} from "@hypit/runtime-kit";
import { createElevenLabsProvider } from "./index.js";
export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [
    createRuntimeEndpointAdapterFacet({
      use: "@hypit/provider-elevenlabs",
      activate(context) {
        const c = runtimeConfigObject(context.config, "elevenlabs");
        runtimeConfigExact(
          c,
          [
            "apiKey",
            "baseUrl",
            "defaultConcurrency",
            "actionLimits",
            "pollIntervalMs",
            "requestTimeoutMs",
            "operationTimeoutMs",
            "enabledModels",
            "allowGatedModels",
          ],
          "elevenlabs",
        );
        const apiKey = runtimeConfigCredentialRef(c.apiKey, "apiKey");
        if (!apiKey) throw new Error("apiKey CredentialRef is required");
        const baseUrl = runtimeConfigString(c.baseUrl, "baseUrl");
        if (
          c.enabledModels !== undefined &&
          (!Array.isArray(c.enabledModels) ||
            !c.enabledModels.every((m) => typeof m === "string"))
        )
          throw new Error("enabledModels must be strings");
        if (
          c.allowGatedModels !== undefined &&
          typeof c.allowGatedModels !== "boolean"
        )
          throw new Error("allowGatedModels must be boolean");
        const numeric = Object.fromEntries(
          [
            "defaultConcurrency",
            "pollIntervalMs",
            "requestTimeoutMs",
            "operationTimeoutMs",
          ].flatMap((k) => {
            const v = runtimeConfigPositiveInteger(c[k], k);
            return v === undefined ? [] : [[k, v]];
          }),
        );
        const actionLimits = runtimeConfigActionLimits(c.actionLimits);
        return {
          endpoint: createElevenLabsProvider({
            instance: context.instance,
            ...(context.pool ? { pool: context.pool } : {}),
            apiKey,
            ...(baseUrl ? { baseUrl } : {}),
            ...numeric,
            ...(actionLimits ? { actionLimits } : {}),
            ...(c.enabledModels
              ? { enabledModels: c.enabledModels as string[] }
              : {}),
            ...(typeof c.allowGatedModels === "boolean"
              ? { allowGatedModels: c.allowGatedModels }
              : {}),
          }),
        };
      },
    }),
  ],
};
export default hypitPackage;
