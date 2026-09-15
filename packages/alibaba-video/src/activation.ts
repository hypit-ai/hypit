/**
 * Alibaba Video Generation Model Activation
 *
 * Registers the model and its markup surfaces with the Hypit runtime.
 *
 * NOTE: the upstream `feature/alibaba-video` branch shipped this file as a bare
 * `export function activate(context) { ... }`, but Hypit 0.1.9's package loader
 * (`packages/package-loader-node/src/loader.ts`, `importContribution`) requires the
 * activation module's DEFAULT export to be a `hypit.node-package@1` contribution that
 * declares `modules`, `components` and `hostFacets`. A plain `activate` function is
 * rejected ("activation has no default package export" / "unsupported package format").
 * This rewrite mirrors the proven `@hypit/seedance` model package so the model loads.
 */

import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeAlibabaVideoReferenceVideoSurface,
  decodeAlibabaVideoTextVideoSurface,
  alibabaVideoComponent,
  alibabaVideoDefinition,
  alibabaVideoManifest,
  alibabaVideoModuleRef,
  alibabaVideoMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: alibabaVideoManifest }],
  components: [alibabaVideoComponent],
  hostFacets: [
    alibabaVideoDefinition.hostFacet,
    createMarkupSurfaceHostFacet({
      module: alibabaVideoModuleRef,
      declaration: alibabaVideoMarkupSurfaces.find((item) => item.name === "text-video")!,
      handler: decodeAlibabaVideoTextVideoSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: alibabaVideoModuleRef,
      declaration: alibabaVideoMarkupSurfaces.find((item) => item.name === "reference-video")!,
      handler: decodeAlibabaVideoReferenceVideoSurface,
    }),
  ],
};

export default hypitPackage;
