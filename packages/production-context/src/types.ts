import type { ProjectObjectRef } from "@hypit/project";

/** Rebuildable owner projection of one persistent object. */
export type ProjectObjectObservation = {
  readonly ref: ProjectObjectRef;
  readonly label: string;
  readonly references: readonly ProjectObjectRef[];
};

export type ProjectObjectOwnerContext = {
  readonly projectRoot: string;
};

/** One domain owner selected by the Host for one exact document format. */
export type ProjectObjectOwner = {
  readonly format: string;
  readonly discover: (
    context: ProjectObjectOwnerContext,
  ) => readonly ProjectObjectRef[] | Promise<readonly ProjectObjectRef[]>;
  readonly observe: (
    ref: ProjectObjectRef,
    context: ProjectObjectOwnerContext,
  ) => ProjectObjectObservation | Promise<ProjectObjectObservation>;
};

/** One application projection. Deleting it changes no author document. */
export type ProductionContext = {
  readonly projectRoot: string;
  readonly objects: readonly ProjectObjectObservation[];
  readonly unresolved: readonly ProjectObjectRef[];
};

export type ProductionContextHost = {
  readonly observe: (
    projectRoot: string,
    ref: ProjectObjectRef,
  ) => Promise<ProjectObjectObservation>;
  readonly project: (
    projectRoot: string,
    seeds?: readonly ProjectObjectRef[],
  ) => Promise<ProductionContext>;
};
