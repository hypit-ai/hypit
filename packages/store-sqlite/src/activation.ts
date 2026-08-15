import {
  createRuntimeInfrastructureAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-kit";
import { resolve } from "node:path";

const sqliteStateAdapter = createRuntimeInfrastructureAdapterFacet({
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
    const { createSqliteRuntimeInfrastructurePackage } = await import("./store.js");
    return createSqliteRuntimeInfrastructurePackage({
      path: resolve(context.dataRoot, path),
      instance: context.instance,
      ...(runtimeConfigPositiveInteger(config.busyTimeoutMs, "SQLite busyTimeoutMs") === undefined
        ? {} : { busyTimeoutMs: config.busyTimeoutMs as number }),
      ...(context.access === "read-only" ? { readOnly: true } : {}),
    });
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [sqliteStateAdapter],
};

export default narratagePackage;
