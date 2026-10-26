import type { ValueSchema } from "@hypit/hypit/protocol";

const string = { kind: "string", minLength: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const token = object({ tokenId: { schema: string }, segmentId: { schema: string }, text: { schema: string },
  startBoundaryId: { schema: string }, endBoundaryId: { schema: string } });
const exact = object({ ticks: { schema: string }, timeBase: { schema: object({
  numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
  denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
}) } });
const boundary = object({ id: { schema: string }, at: { schema: exact } });
const segment = object({ segmentId: { schema: string }, startBoundaryId: { schema: string }, endBoundaryId: { schema: string } });

export const narrativeAlignmentSchema: ValueSchema = object({
  narrativeId: { schema: string }, domainId: { schema: string }, segment: { schema: segment },
  tokens: { schema: { kind: "array", items: token } }, boundaries: { schema: { kind: "array", items: boundary } },
});
