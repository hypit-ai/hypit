import type { CliDistribution } from "@hypit/cli";
import { productExporterForType, productExportersFromFacets } from "@hypit/product";
import { loadNodePackageSelection } from "@hypit/loader/node";
import { moduleKey, modulePackageAbi } from "@hypit/protocol";
import {
  doctorProjectPublicationStores,
  findRuntimeProfile,
  openLocalRuntimeHost,
  openProjectPublicationStores,
} from "@hypit/runtime-local";
import type { LocalRuntimeCliDistribution } from "@hypit/runtime-local-cli";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createToolchainCompiler,
  createToolchainWorkspace,
} from "./compiler.js";

// The Distribution root is the replaceable Hypit tool checkout, not this
// package's source directory and never the author's project.
export type ToolchainDistributionOptions = {
  /** Physical root of the installed Hypit Distribution. */
  readonly packageRoot?: string;
  /** Exact executable the Local Runtime Worker must re-enter. */
  readonly launcher?: string;
};

/** Assemble the official Hypit toolchain once at its executable composition root. */
export function createToolchainDistribution(options: ToolchainDistributionOptions = {}): CliDistribution & LocalRuntimeCliDistribution {
  const packageRoot = resolve(options.packageRoot ?? resolve(import.meta.dirname, "../../.."));
  const launcher = options.launcher ?? fileURLToPath(new URL("../../../bin/hypit.mjs", import.meta.url));
  const openToolchainLocalRuntime = async (path: string, runtimeOptions: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }) => await openLocalRuntimeHost(path, {
    packageRoot: runtimeOptions.packageRoot,
    ...(runtimeOptions.distributionPackageRoot === undefined
      ? {}
      : { distributionPackageRoot: runtimeOptions.distributionPackageRoot }),
    workerLaunch: {
      command: process.execPath,
      args: [launcher],
    },
  });
  return {
    packageRoot,
    bootstrapPackages: [],
    initialRuntimeProfile: {
      format: "hypit.runtime-local@1",
      dataRoot: ".hypit/runtimes/local",
      // The starter selects the portable Store, so the Profile it writes is openable and writable on
      // Linux as well: macOS and Windows keep the platform locker, and a Linux host uses an
      // owner-private file. An explicit file backend remains available inside the same local Store.
      credentials: {
        local: { use: "@hypit/credential-store-local" },
      },
      endpoints: {
        "hypihub.default": {
          use: "@hypit/provider-hypihub",
          config: {
            baseUrl: "https://hypit.ai",
            apiKey: { store: "local", key: "hypihub.oauth" },
          },
        },
        "media.local": {
          use: "@hypit/provider-media-local",
        },
        "html.local": {
          use: "@hypit/provider-html-local",
        },
        "image.opencv.local": {
          use: "@hypit/provider-image-opencv-local",
        },
      },
    },
    createWorkspace: createToolchainWorkspace,
    resolveProjectRuntime: async (projectRoot) => {
      const selected = await findRuntimeProfile(projectRoot);
      return selected === undefined ? undefined : { profile: selected.profile };
    },
    createCompiler: createToolchainCompiler,
    discoverSourcePackages: async (path, options) => {
      const { discoverToolchainSourcePackages } = await import("./package-selection.js");
      return await discoverToolchainSourcePackages(path, options);
    },
    openLocalRuntimeHost: openToolchainLocalRuntime,
    openRuntimeHost: openToolchainLocalRuntime,
    openProjectResults: async (projectRoot) => {
      const opened = await openProjectPublicationStores(projectRoot);
      return {
        location: opened.location,
        history: opened.history,
        products: opened.products,
        close() {},
      };
    },
    resolveProductExporter: async (type, resolverOptions) => {
      const packages = await loadNodePackageSelection({
        selected: [],
        logical: [{ abi: modulePackageAbi, name: moduleKey(type.module) }],
      }, resolverOptions.packageRoot, {
        ...(resolverOptions.distributionPackageRoot === undefined
          ? {}
          : { fallbackRoots: [resolverOptions.distributionPackageRoot] }),
      });
      return productExporterForType(
        packages.flatMap((item) => productExportersFromFacets(item.contribution.facets ?? [])),
        type,
      );
    },
    diagnoseProjectResults: async (projectRoot) => await doctorProjectPublicationStores(projectRoot),
  };
}
