import type {
  GenerationCanvasCatalogItem,
  GenerationCanvasScene,
  GenerationWorkspace,
  GenerationWorkspaceTransaction,
} from "@hypit/generation-canvas";
import type {
  GenerationGraphNodeReport,
  GenerationGraphProject,
  GenerationGraphTransaction,
} from "@hypit/generation-graph";
import type { WorkbenchProjectMediaView } from "./protocol.js";

export type GenerationCanvasWorkbenchSnapshot = {
  readonly format: "hypit.workbench-generation-canvas@1";
  readonly graph: GenerationGraphProject;
  readonly workspace: GenerationWorkspace;
  readonly scene: GenerationCanvasScene;
  readonly nodes: readonly GenerationGraphNodeReport[];
  readonly catalog: readonly GenerationCanvasCatalogItem[];
  readonly mediaLibrary: {
    readonly generation: number;
    readonly assets: readonly WorkbenchProjectMediaView[];
  };
  readonly generation: { readonly available: boolean; readonly issue?: string };
  readonly environment?: GenerationCanvasWorkbenchEnvironment;
  readonly materialization: { readonly available: boolean; readonly issue?: string };
  readonly workspaceFile: string;
  readonly graphFile: string;
};

export type GenerationCanvasWorkbenchCredential = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly configured: boolean;
  readonly writable: boolean;
  readonly acquisition?: "oauth2-pkce";
};

/** Transient Host environment state. It never becomes part of Graph or Canvas authoring data. */
export type GenerationCanvasWorkbenchEnvironment = {
  readonly status: "ready" | "action-required" | "unavailable";
  readonly runtime: {
    readonly selected: boolean;
    readonly label?: string;
    readonly candidate?: string;
  };
  readonly credentials: readonly GenerationCanvasWorkbenchCredential[];
  readonly issue?: string;
};

/** One user request to regenerate a target using selected upstream Products as reuse boundaries. */
export type GenerationCanvasWorkbenchBuildRequest = {
  readonly graphRevision: number;
  readonly workspaceRevision: number;
  readonly node: string;
};

export type GenerationCanvasWorkbenchBuildResponse = {
  readonly snapshot: GenerationCanvasWorkbenchSnapshot;
  readonly build: string;
  readonly generated: readonly string[];
  /** Accepted outputs whose producing node disappeared before attachment. */
  readonly unattached: readonly string[];
};

/** Promote one exact ready Product into a new authored Media Asset node. */
export type GenerationCanvasWorkbenchMaterializeRequest = {
  readonly graphRevision: number;
  readonly workspaceRevision: number;
  readonly sourceNode: string;
  readonly product: { readonly build: string; readonly output: string };
  readonly placement: { readonly x: number; readonly y: number };
};

export type GenerationCanvasWorkbenchMaterializeResponse = {
  readonly snapshot: GenerationCanvasWorkbenchSnapshot;
  readonly materialized: {
    readonly node: string;
    readonly asset: string;
    readonly role: "image" | "video" | "audio";
    readonly product: { readonly build: string; readonly output: string };
  };
};

export type GenerationCanvasWorkbenchTransactionRequest = {
  readonly transaction: GenerationWorkspaceTransaction;
};

export type GenerationCanvasWorkbenchGraphTransactionRequest = {
  readonly transaction: GenerationGraphTransaction;
};

/** One Canvas gesture that changes the recipe and its presentation together. */
export type GenerationCanvasWorkbenchEditRequest = {
  readonly graph: GenerationGraphTransaction;
  readonly workspace: GenerationWorkspaceTransaction;
};

export type GenerationCanvasWorkbenchImport = {
  readonly node: string;
  readonly asset: string;
  readonly role: "image" | "video" | "audio";
};

export type GenerationCanvasWorkbenchImportResponse = {
  readonly snapshot: GenerationCanvasWorkbenchSnapshot;
  readonly imported: GenerationCanvasWorkbenchImport;
};

export type GenerationCanvasWorkbenchPlaceMediaRequest = {
  readonly graphRevision: number;
  readonly workspaceRevision: number;
  /** Project-relative Media Asset identity from the Host-derived media catalog. */
  readonly media: string;
  readonly placement: { readonly x: number; readonly y: number };
};

export type GenerationCanvasWorkbenchPlaceMediaResponse = {
  readonly snapshot: GenerationCanvasWorkbenchSnapshot;
  readonly placed: GenerationCanvasWorkbenchImport & { readonly existing: boolean };
};
