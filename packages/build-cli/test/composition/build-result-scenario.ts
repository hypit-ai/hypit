import { join } from "node:path";

import { FileBuildFinalization, FileBuildFinalizationStore } from "../../../runtime-local/src/result-storage/index.js";
import { FileBuildResultHistory } from "@hypit/result/node";
import { FileProductHistory } from "@hypit/product/node";
import type { ProductExporter } from "@hypit/product";
import type { CapabilityRef, TypeRef, TypedRecord } from "@hypit/protocol";
import { sameType } from "@hypit/protocol";

import type { BuildOperationsCliServices } from "../../src/services.js";
import { runBuildOperationsCli as runCli } from "../../src/main.js";
import { buildCliServices } from "../services-scenario.js";

export const valueType: TypeRef = {
  module: { name: "example.result", version: "1" },
  name: "Value",
};

export const generationCapability: CapabilityRef = {
  module: valueType.module,
  name: "generation",
};

export function publicationIntent(
  outputs: readonly { readonly name: string; readonly record?: string }[],
) {
  return { outputs: outputs.map((output) => ({ name: output.name,
    record: output.record ?? `record:${output.name}`,
    publisher: "example.test-product@1",
  })) };
}

export function completedRecords(): readonly TypedRecord[] {
  return [{ id: "record:stage", type: valueType, value: "ready" }];
}

export async function fixture(root: string, id = "bld_20260902T110000000Z_0000000001", source = "main.svml"): Promise<void> {
  const result = await FileBuildFinalization.create(
    join(root, ".hypit", "results"),
    join(root, ".hypit", "products"),
    {
    id,
    sourcePath: source,
    targets: ["stage.value"],
    publication: publicationIntent([{ name: "stage.value", record: "record:stage" }]),
  });
  await result.sync({
    records: completedRecords(),
    resources: { async open() { throw new Error("inline Result has no files"); } },
  });
  await result.finish({ outcome: "complete" });
}

export function resultDistribution(): BuildOperationsCliServices {
  return buildCliServices({
    async openProjectResults(projectRoot: string) {
      const finalization = new FileBuildFinalizationStore(
        join(projectRoot, ".hypit", "results"),
        join(projectRoot, ".hypit", "products"),
      );
      return {
        location: {
          root: projectRoot,
          historyPath: ".hypit/results",
          productsPath: ".hypit/products",
        },
        history: new FileBuildResultHistory(join(projectRoot, ".hypit", "results")),
        products: new FileProductHistory(join(projectRoot, ".hypit", "products")),
        close() {},
      };
    },
    async resolveProductExporter(type: TypeRef): Promise<ProductExporter | undefined> {
      if (!sameType(type, { module: { name: "example.speech", version: "1" }, name: "StructuredValue" })) {
        return undefined;
      }
      return {
        type,
        export({ value }) {
          const words = (value as { readonly words: readonly string[] }).words;
          return {
            bytes: new TextEncoder().encode(`${JSON.stringify({ words }, null, 2)}\n`),
          };
        },
      };
    },
    async diagnoseProjectResults() { return { diagnostics: [] }; },
  });
}

export async function jsonCommand(args: readonly string[], root: string): Promise<unknown> {
  let output = "";
  await runCli([...args, "--project", root, "--json"], {
    write(text) { output += text; },
  }, resultDistribution());
  return JSON.parse(output);
}

export async function humanCommand(args: readonly string[], root: string): Promise<string> {
  let output = "";
  await runCli([...args, "--project", root], {
    write(text) { output += text; },
  }, resultDistribution());
  return output;
}
