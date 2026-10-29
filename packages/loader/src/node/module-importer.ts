import { NodeModuleScope } from "./module-scope.js";

/** One explicitly bounded module-loading lifetime owned by an execution Host. */
export type NodeModuleImporter = {
  import(url: string): Promise<unknown>;
  close(): void;
};

/** Create an isolated binding scope without exposing Loader's CommonJS bridge. */
export function createNodeModuleImporter(): NodeModuleImporter {
  const scope = new NodeModuleScope();
  return {
    import: async (url) => await scope.import(url),
    close: () => scope.close(),
  };
}
