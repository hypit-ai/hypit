import { createTemporalInstantProjection, createTemporalWindowProjection, temporalInstantAttributeNames, temporalWindowAttributeNames } from "@hypit/temporal-markup";

/** The fixture intentionally exposes both projection helpers and their vocabularies. */
export { temporalInstantAttributeNames, temporalWindowAttributeNames };
export const projectExampleWindow = createTemporalWindowProjection;
export const projectExampleMoment = createTemporalInstantProjection;
