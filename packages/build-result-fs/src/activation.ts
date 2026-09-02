import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { FileBuildResultRepository } from "@hypit/build-result";
import { buildResultConfigExact, buildResultConfigObject, buildResultConfigString, createBuildResultRepositoryHostFacet } from "@hypit/build-result-kit";

const filesystemBuildResultRepository = createBuildResultRepositoryHostFacet({
  use: "@hypit/build-result-fs",
  validate(context) {
    const config = buildResultConfigObject(context.config, "filesystem Build Result Repository");
    buildResultConfigExact(config, ["path"], "filesystem Build Result Repository");
    if (buildResultConfigString(config.path, "Build Result path") === undefined) {
      throw new Error("Build Result path is required");
    }
  },
  open(context) {
    const config = buildResultConfigObject(context.config, "filesystem Build Result Repository");
    const path = buildResultConfigString(config.path, "Build Result path");
    if (path === undefined) throw new Error("Build Result path is required");
    return {
      repository: new FileBuildResultRepository(resolve(context.root, path)),
    };
  },
  async doctor(context) {
    const config = buildResultConfigObject(context.config, "filesystem Build Result Repository");
    const selected = buildResultConfigString(config.path, "Build Result path");
    if (selected === undefined) return [];
    const target = resolve(context.root, selected);
    let current = target;
    try {
      while (true) {
        const found = await stat(current).catch((error: unknown) => {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
          throw error;
        });
        if (found !== undefined) {
          if (!found.isDirectory()) throw new Error(`${current} is not a directory`);
          await access(current, constants.R_OK | constants.W_OK);
          return [];
        }
        const parent = dirname(current);
        if (parent === current) throw new Error(`no existing parent directory for ${target}`);
        current = parent;
      }
    } catch (error) {
      return [{
        severity: "error" as const,
        code: "RESULT_REPOSITORY_UNAVAILABLE",
        message: error instanceof Error ? error.message : String(error),
        subject: target,
      }];
    }
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [filesystemBuildResultRepository],
};

export default hypitPackage;
