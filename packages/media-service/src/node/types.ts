import type { MediaAssetDocument } from "@hypit/media-asset";
import type { ProjectObjectRef } from "@hypit/project";

import type {
  ProjectMediaRepresentationCommand,
  ProjectMediaRepresentationReceipt,
  ProjectMediaService,
} from "../types.js";

export type ProjectMediaFileResource = {
  readonly file: string;
  readonly mediaType: string;
  readonly size: number;
  readonly revision: string;
};

export class ProjectMediaRevisionConflict extends Error {
  readonly name = "ProjectMediaRevisionConflict";

  constructor(
    readonly asset: ProjectObjectRef,
    readonly expectedRevision: string,
    readonly actualRevision: string,
    message = `Media Asset ${asset.path} changed after it was observed.`,
  ) {
    super(message);
  }
}

export type ProjectMediaMaterialization = {
  readonly ref: ProjectObjectRef;
  readonly document: MediaAssetDocument;
};

export type NodeProjectMediaService = ProjectMediaService & {
  resource(ref: ProjectObjectRef): ProjectMediaFileResource | undefined;
  materialization(ref: ProjectObjectRef): ProjectMediaMaterialization | undefined;
  commitRepresentation(command: ProjectMediaRepresentationCommand): Promise<ProjectMediaRepresentationReceipt>;
};

export type NodeProjectMediaServiceOptions = {
  /** Maximum Manifest entries read concurrently during one reconciliation. */
  readonly scanConcurrency?: number;
  /** Filesystem event coalescing window. */
  readonly watchDebounceMs?: number;
};

export type NodeProjectMediaServiceLease = {
  readonly service: NodeProjectMediaService;
  release(): Promise<void>;
};

/** Invocation-local Project Host composition; it is not authored project state. */
export type NodeProjectMediaServicePool = {
  acquire(projectRoot: string): NodeProjectMediaServiceLease;
  close(): Promise<void>;
};
