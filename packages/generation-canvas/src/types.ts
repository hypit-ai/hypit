export type GenerationWorkspaceGraphReference = {
  /** Portable path relative to the Workspace file. */
  readonly path: string;
};

/** One exact Build output. It becomes a Product address only after publication succeeds. */
export type GenerationWorkspaceOutputAddress = {
  readonly build: string;
  readonly output: string;
};

export type GenerationWorkspaceNode = {
  readonly node: string;
  /** Editable occurrence name. Graph identity and dependency references remain stable. */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Explicit media-frame size. Omitted means the Canvas derives size from the displayed media. */
  readonly width?: number;
  readonly height?: number;
  /** Exact Product used when downstream interactive generation reaches this operation. */
  readonly selected?: GenerationWorkspaceOutputAddress;
};

export type GenerationWorkspaceViewport = {
  /** Graph coordinate displayed at the center of the Canvas viewport. */
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
};

/** An exact result reference attached to its producing operation node, never copied Runtime state. */
export type GenerationWorkspaceOutput = GenerationWorkspaceOutputAddress & {
  readonly node: string;
};

export function generationWorkspaceOutputKey(output: GenerationWorkspaceOutputAddress): string {
  return JSON.stringify([output.build, output.output]);
}

/**
 * Interactive state for one Generation Graph: spatial organization, attached outputs and explicit
 * Product selection. Runtime activity, Result outcome and Product values remain observations.
 */
export type GenerationWorkspace = {
  readonly format: "hypit.generation-workspace@1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly graph: GenerationWorkspaceGraphReference;
  /** Explicitly installed editor packages offered by the Canvas palette; Build never reads this list. */
  readonly packages: readonly string[];
  readonly viewport: GenerationWorkspaceViewport;
  readonly nodes: readonly GenerationWorkspaceNode[];
  readonly outputs: readonly GenerationWorkspaceOutput[];
};
