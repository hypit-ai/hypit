import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationFieldShape,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { timelineTypes } from "@hypit/timeline";

import { temporalTypes } from "./index.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;
type ResolveReference = (
  path: string,
) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined;

export const temporalContextFieldShape = {
  name: "timeline",
  kind: "reference",
  required: true,
  accepts: [timelineTypes.timeline],
  summary: "Selects the complete absolute film Timeline.",
} as const satisfies AuthorDeclarationFieldShape;

export const temporalWindowFieldShape = {
  name: "during",
  kind: "expression",
  required: true,
  accepts: [temporalTypes.window],
  summary: "Selects an already resolved Window.",
} as const satisfies AuthorDeclarationFieldShape;

export const temporalInstantFieldShape = {
  name: "at",
  kind: "expression",
  required: true,
  accepts: [temporalTypes.instant],
  summary: "Selects an already resolved Instant.",
} as const satisfies AuthorDeclarationFieldShape;

async function resolvedReference(
  declaration: DeclarationLike,
  attribute: string,
  type: TypeRef,
  resolveReference: ResolveReference,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, attribute);
  if (field?.kind !== "reference") throw new Error(`${declaration.name}.${attribute} must be a reference.`);
  const found = await resolveReference(field.path);
  if (found === undefined || !sameType(found.type, type)) {
    throw new Error(`${declaration.name}.${attribute} has the wrong Type.`);
  }
  return found;
}

export function resolveAuthorTimeline(
  declaration: DeclarationLike,
  resolveReference: ResolveReference,
): Promise<AuthorResolvedReference> {
  return resolvedReference(declaration, "timeline", timelineTypes.timeline, resolveReference);
}

export function resolveAuthorWindow(
  declaration: DeclarationLike,
  resolveReference: ResolveReference,
  attribute = "during",
): Promise<AuthorResolvedReference> {
  return resolvedReference(declaration, attribute, temporalTypes.window, resolveReference);
}

export function resolveAuthorInstant(
  declaration: DeclarationLike,
  resolveReference: ResolveReference,
  attribute = "at",
): Promise<AuthorResolvedReference> {
  return resolvedReference(declaration, attribute, temporalTypes.instant, resolveReference);
}
