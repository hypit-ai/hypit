import { join } from "node:path";

import { FileBuildResult, FileBuildResultStore } from "@hypit/result/runtime-storage/node";
import type { ResultOutputExporter } from "@hypit/result";
import type { CapabilityRef, TypeRef, TypedRecord } from "@hypit/protocol";
import { sameType } from "@hypit/protocol";

import type { CliDistribution } from "../../src/distribution.js";
import { runCli } from "../../src/main.js";
import { cliDistribution } from "../distribution-scenario.js";

export const valueType: TypeRef = {
  module: { name: "example.result", version: "1" },
  name: "Value",
};

export const generationCapability: CapabilityRef = {
  module: valueType.module,
  name: "generation",
};

export function resultIntent(
  outputs: readonly { readonly name: string; readonly record?: string }[],
) {
  return { outputs: outputs.map((output) => ({ name: output.name,
    record: output.record ?? `record:${output.name}`,
  })) };
}

export function completedRecords(): readonly TypedRecord[] {
  return [{ id: "record:stage", type: valueType, value: "ready" }];
}

export async function fixture(root: string, id = "bld_20260902T110000000Z_0000000001", source = "main.svml"): Promise<void> {
  const result = await FileBuildResult.create(join(root, ".hypit", "results"), {
    id,
    sourcePath: source,
    targets: ["stage.value"],
    intent: resultIntent([{ name: "stage.value", record: "record:stage" }]),
  });
  await result.sync({
    records: completedRecords(),
    resources: { async open() { throw new Error("inline Result has no files"); } },
  });
  await result.finish({ outcome: "complete" });
}

export function resultDistribution(): CliDistribution {
  return cliDistribution({
    async openProjectResults(projectRoot: string) {
      return {
        location: {
          root: projectRoot,
          selection: { use: "test.results", config: {} },
        },
        repository: new FileBuildResultStore(join(projectRoot, ".hypit", "results")),
        close() {},
      };
    },
    async resolveResultOutputExporter(type: TypeRef): Promise<ResultOutputExporter | undefined> {
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
