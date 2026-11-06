import type {
  AuthorEditSubject,
  AuthorProvenance,
  AuthorStructureDocument,
} from "@hypit/hypit/author";
import type { TemporalMap } from "@hypit/temporal/algebra";

import type { NleViewProjection } from "./index.js";
import {
  prepareNleSubjectProjection,
  projectPreparedNleSubject,
  type NlePreparedSubjectProjection,
  type NleProjectionObservation,
  type NleSubjectLocation,
  type NleSubjectProjection,
  type NleSubjectProjectorRegistry,
} from "./projection.js";

export type NlePreparedViewSubject = {
  readonly endpoint: string;
  readonly projection: NlePreparedSubjectProjection;
};

export type NlePreparedViewProjection = {
  readonly id: string;
  readonly programme: string;
  readonly requiredOutputs: readonly string[];
  readonly lanes: readonly {
    readonly id: string;
    readonly label: string;
    readonly subjects: readonly NlePreparedViewSubject[];
  }[];
};

export type NleProjectedViewSubject = {
  readonly endpoint: string;
  readonly ownerId: string;
  readonly subject: AuthorEditSubject;
  readonly projections: readonly NleSubjectProjection[];
};

export type NleProjectedView = {
  readonly id: string;
  readonly programme: string;
  readonly lanes: readonly {
    readonly id: string;
    readonly label: string;
    readonly subjects: readonly NleProjectedViewSubject[];
  }[];
};

/** Prepare every View endpoint before Programme execution and union its package-requested outputs. */
export function prepareNleViewProjection(input: {
  readonly view: NleViewProjection;
  readonly documents: readonly AuthorStructureDocument[];
  readonly provenance: AuthorProvenance;
  readonly registry: Pick<NleSubjectProjectorRegistry, "resolve">;
  readonly locate: (endpoint: string) => NleSubjectLocation;
}): NlePreparedViewProjection {
  const requiredOutputs = new Set<string>();
  const lanes = input.view.lanes.map((lane) => ({
    id: lane.id,
    label: lane.label,
    subjects: lane.items.map((endpoint) => {
      const projection = prepareNleSubjectProjection({
        location: input.locate(endpoint),
        documents: input.documents,
        provenance: input.provenance,
        registry: input.registry,
      });
      projection.requiredOutputs.forEach((output) => requiredOutputs.add(output));
      return { endpoint, projection };
    }),
  }));
  return {
    id: input.view.id,
    programme: input.view.programme,
    requiredOutputs: [...requiredOutputs].sort(),
    lanes,
  };
}

/** Project all prepared subjects after the closed Programme supplies endpoint Maps. */
export function projectPreparedNleView(input: {
  readonly prepared: NlePreparedViewProjection;
  readonly observation: NleProjectionObservation;
  readonly registry: Pick<NleSubjectProjectorRegistry, "project">;
  readonly realize?: (endpoint: string) =>
    { readonly id: string; readonly mapping: TemporalMap } | undefined;
}): NleProjectedView {
  return {
    id: input.prepared.id,
    programme: input.prepared.programme,
    lanes: input.prepared.lanes.map((lane) => ({
      id: lane.id,
      label: lane.label,
      subjects: lane.subjects.map(({ endpoint, projection }) => {
        const target = input.realize?.(endpoint) ?? projection.target;
        if (target !== undefined && target.id !== endpoint) {
          throw new Error(`NLE endpoint ${endpoint} was realized as ${target.id}.`);
        }
        const prepared = target === undefined ? projection : { ...projection, target };
        return {
          endpoint,
          ownerId: prepared.ownerId,
          subject: prepared.subject,
          projections: projectPreparedNleSubject(prepared, input.observation, input.registry),
        };
      }),
    })),
  };
}
