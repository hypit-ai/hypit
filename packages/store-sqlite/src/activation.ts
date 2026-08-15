import {
  createRuntimeComponentAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import { resolve } from "node:path";

const sqliteStateAdapter = createRuntimeComponentAdapterFacet({
  use: "@narratage/store-sqlite",
  validate(context) {
    const config = runtimeConfigObject(context.config, "SQLite Runtime state");
    runtimeConfigExact(config, ["path", "busyTimeoutMs"], "SQLite Runtime state");
    if (runtimeConfigString(config.path, "SQLite path") === undefined) throw new Error("SQLite path is required");
    runtimeConfigPositiveInteger(config.busyTimeoutMs, "SQLite busyTimeoutMs");
  },
  async create(context) {
    const config = runtimeConfigObject(context.config, "SQLite Runtime state");
    const path = runtimeConfigString(config.path, "SQLite path");
    if (path === undefined) throw new Error("SQLite path is required");
    const { createSqliteRuntimeComponentPackage } = await import("./store.js");
    return createSqliteRuntimeComponentPackage({
      path: resolve(context.dataRoot, path),
      buildInstance: `${context.instance}.builds`,
      operationInstance: `${context.instance}.operations`,
      dispatchInstance: `${context.instance}.dispatch`,
      ...(runtimeConfigPositiveInteger(config.busyTimeoutMs, "SQLite busyTimeoutMs") === undefined
        ? {} : { busyTimeoutMs: config.busyTimeoutMs as number }),
      ...(context.access === "read-only" ? { readOnly: true } : {}),
    });
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  hostFacets: [sqliteStateAdapter],
};

export default svmlPackage;
