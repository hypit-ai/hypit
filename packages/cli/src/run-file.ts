import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { NodeCompiler, NodeCompiledSourceClosure } from "@svml/compiler-node";
import type { LocalRuntime } from "@svml/local";
import type { NodePackageContribution } from "@svml/package-loader-node";
import {
  parseRunDocument,
  resolveRunDocument,
  RunFragmentRegistry,
} from "@svml/run";
import type { ResolvedRunDocument, RunDocument } from "@svml/run";

export type LoadedRunFile = {
  readonly path: string;
  readonly source: string;
  readonly document: RunDocument;
  readonly compilation: NodeCompiledSourceClosure;
  readonly run: ResolvedRunDocument;
};

export async function loadRunFile(options: {
  readonly path: string;
  readonly compiler: NodeCompiler;
  readonly packageContributions: readonly NodePackageContribution[];
  readonly runtime?: Pick<LocalRuntime, "status">;
}): Promise<LoadedRunFile> {
  const path = resolve(options.path);
  const directory = dirname(path);
  const document = parseRunDocument(path, await readFile(path, "utf8"));
  const source = resolve(directory, document.source);
  const compilation = await options.compiler.compileFile(source);
  const fragments = new RunFragmentRegistry();
  for (const item of options.packageContributions) {
    if (item.runFragments === undefined || Object.keys(item.runFragments).length === 0) continue;
    fragments.register({ name: item.name, fragments: item.runFragments });
  }
  const run = await resolveRunDocument(document, {
    compilation,
    fragments,
    async readStoredValue(from) {
      return JSON.parse(await readFile(resolve(directory, from), "utf8"));
    },
    async readBuild(id) {
      if (options.runtime === undefined) {
        throw new Error(`Run Candidate uses Build ${id}; select a Runtime Profile so it can be resolved`);
      }
      return (await options.runtime.status(id)).build?.state;
    },
  });
  return { path, source, document, compilation, run };
}
