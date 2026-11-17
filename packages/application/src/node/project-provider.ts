import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ApplicationProjectProvider, IdentifiedApplicationProject } from "../index.js";
import { openNodeProjectHost, readNodeProjectManifest } from "@hypit/project/node";

type NodeApplicationProjectInput = {
  readonly root: string;
};

function input(value: unknown): NodeApplicationProjectInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof (value as { root?: unknown }).root !== "string") {
    throw new Error("Node Application Project input requires a root path.");
  }
  return { root: (value as { root: string }).root };
}

async function identifyNodeApplicationProject(value: unknown): Promise<IdentifiedApplicationProject> {
  const selected = input(value);
  const requested = resolve(selected.root);
  const information = await stat(requested);
  if (!information.isDirectory()) throw new Error(`Project Boundary ${requested} is not a directory.`);
  const root = await realpath(requested);
  const manifest = await readNodeProjectManifest(root);
  return {
    key: root,
    input: { root } satisfies NodeApplicationProjectInput,
    boundary: { root, manifest },
  };
}

export function createNodeApplicationProjectProvider(): ApplicationProjectProvider {
  return {
    identify: identifyNodeApplicationProject,
    open: async (value, executorClients) => {
      const selected = input(value);
      return await openNodeProjectHost({ root: selected.root, executorClients });
    },
  };
}
