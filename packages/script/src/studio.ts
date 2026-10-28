import { narrativeTypes } from "@hypit/narrative";
import { narrativeTemporalTypes } from "@hypit/narrative-temporal";
import type { NarrativeProjection } from "@hypit/narrative-temporal";
import { sameType } from "@hypit/hypit/protocol";
import type {
  Range,
  StudioTemporalDomainCompanion,
  StudioTemporalDomainProjection,
  StudioTemporalDomainProjectionInput,
} from "@hypit/studio-companion";

import { adjustScriptMoment, adjustScriptSelection } from "./edit.js";
import { scriptModuleRef } from "./manifest.js";
import { parseScript } from "./parser.js";

const timelineBandHeightPx = 15;

type NarrativeValue = {
  readonly id?: string;
  readonly segments?: readonly { readonly id: string; readonly startAnchorId: string; readonly endAnchorId: string }[];
  readonly tokens?: readonly { readonly id: string; readonly segmentId: string; readonly startAnchorId: string; readonly endAnchorId: string; readonly text: string }[];
  readonly selections?: readonly { readonly id: string; readonly startAnchorId: string; readonly endAnchorId: string }[];
  readonly moments?: readonly { readonly id: string; readonly anchorId: string }[];
  readonly anchors?: readonly { readonly id: string; readonly kind: string; readonly segmentId?: string; readonly tokenId?: string }[];
};

export type ScriptStudioObservation = {
  readonly segments: readonly { readonly id: string; readonly range: Range }[];
  readonly selections: readonly { readonly id: string; readonly startAnchorId: string; readonly endAnchorId: string; readonly open: Range; readonly close: Range }[];
  readonly moments: readonly { readonly id: string; readonly anchorId: string; readonly range: Range }[];
  readonly tokens: readonly { readonly id: string; readonly range: Range }[];
};

function one<T>(values: readonly T[], subject: string): T | undefined {
  if (values.length > 1) throw new Error(`${subject} resolves to more than one authored value.`);
  return values[0];
}

export function projectScriptTemporalDomain(input: StudioTemporalDomainProjectionInput): readonly StudioTemporalDomainProjection[] {
  const narrative = one(input.values.filter((item) => sameType(item.type, narrativeTypes.narrative)
    && (item.value as NarrativeValue).id === input.source.domainId), `Studio Narrative id ${input.source.domainId}`)?.value as NarrativeValue | undefined;
  if (narrative === undefined) return [];
  const projections = input.values.filter((item) => sameType(item.type, narrativeTemporalTypes.narrativeProjection)
    && (item.value as NarrativeProjection).narrativeId === input.source.domainId
    && (item.value as NarrativeProjection).timelineId === input.timeline.id)
    .map((item) => item.value as NarrativeProjection);
  const source = input.source.data as ScriptStudioObservation;
  const segmentRanges = new Map(source.segments.map((item) => [item.id, item.range]));
  const tokenRanges = new Map(source.tokens.map((item) => [item.id, item.range]));
  const selectionRanges = new Map(source.selections.map((item) => [item.id, { start: item.open.start, end: item.close.end }]));
  const momentRanges = new Map(source.moments.map((item) => [item.id, item.range]));
  const narrativeSegments = new Map((narrative.segments ?? []).map((segment) => [segment.id, segment]));
  const narrativeTokens = new Map((narrative.tokens ?? []).map((token) => [token.id, token]));
  const tokenText = new Map((narrative.tokens ?? []).map((token) => [token.id, token.text]));
  return projections.map((projection) => {
    const frame = new Map(projection.boundaries.map((boundary) => [boundary.id, boundary.frame]));
    const anchors = (narrative.anchors ?? []).flatMap((anchor) => {
      const at = frame.get(anchor.id);
      if (at === undefined) return [];
      const detail = [anchor.tokenId === undefined ? undefined : tokenText.get(anchor.tokenId), anchor.segmentId]
        .filter((part): part is string => part !== undefined).join(" · ");
      return [{ id: anchor.id, kind: anchor.kind, frame: at,
        ...(anchor.tokenId === undefined ? {} : { label: tokenText.get(anchor.tokenId) ?? anchor.tokenId }),
        ...(detail.length === 0 ? {} : { detail }) }];
    });
    const segments = projection.segments.flatMap((projected) => {
      const segment = narrativeSegments.get(projected.segmentId);
      if (segment === undefined) return [];
      const startFrame = frame.get(segment.startAnchorId); const endFrame = frame.get(segment.endAnchorId);
      if (startFrame === undefined || endFrame === undefined) return [];
      return [{ kind: "span" as const, appearance: "block" as const, id: segment.id, laneId: "maps", label: segment.id,
        source: { type: narrativeTypes.segmentRef, kind: "segment", id: segment.id }, startAnchorId: segment.startAnchorId,
        endAnchorId: segment.endAnchorId, startFrame, endFrameExclusive: Math.max(startFrame + 1, endFrame),
        ...(segmentRanges.has(segment.id) ? { range: segmentRanges.get(segment.id)! } : {}) }];
    });
    const tokens = projection.tokens.flatMap((projected) => {
      const token = narrativeTokens.get(projected.tokenId);
      if (token === undefined) return [];
      const startFrame = frame.get(token.startAnchorId); const endFrame = frame.get(token.endAnchorId);
      if (startFrame === undefined || endFrame === undefined) return [];
      return [{ kind: "span" as const, appearance: "compact" as const, id: token.id, laneId: "evidence", label: token.text,
        startAnchorId: token.startAnchorId, endAnchorId: token.endAnchorId, startFrame,
        endFrameExclusive: Math.max(startFrame + 1, endFrame), followPlayhead: true,
        ...(tokenRanges.has(token.id) ? { range: tokenRanges.get(token.id)! } : {}) }];
    });
    const selections = (narrative.selections ?? []).flatMap((selection) => {
      const startFrame = frame.get(selection.startAnchorId); const endFrameExclusive = frame.get(selection.endAnchorId);
      if (startFrame === undefined || endFrameExclusive === undefined || endFrameExclusive <= startFrame) return [];
      return [{ kind: "span" as const, appearance: "block" as const, id: selection.id, laneId: "intent", label: selection.id,
        source: { type: narrativeTypes.selection, kind: "selection", id: selection.id }, editable: true,
        startAnchorId: selection.startAnchorId, endAnchorId: selection.endAnchorId, startFrame, endFrameExclusive,
        ...(selectionRanges.has(selection.id) ? { range: selectionRanges.get(selection.id)! } : {}) }];
    });
    const moments = (narrative.moments ?? []).flatMap((moment) => {
      const at = frame.get(moment.anchorId); if (at === undefined) return [];
      return [{ kind: "point" as const, appearance: "marker" as const, id: moment.id, laneId: "intent", label: moment.id,
        source: { type: narrativeTypes.moment, kind: "moment", id: moment.id }, editable: true,
        anchorId: moment.anchorId, frame: at, ...(momentRanges.has(moment.id) ? { range: momentRanges.get(moment.id)! } : {}) }];
    });
    return { id: projection.id, timelineId: input.timeline.id,
      lanes: [{ id: "maps", label: "Map", heightPx: timelineBandHeightPx },
        { id: "evidence", label: "Evidence", heightPx: timelineBandHeightPx }],
      anchors, items: [...segments, ...tokens], editItems: [...selections, ...moments] };
  });
}

const scriptTemporalSourceTypes = [narrativeTypes.segmentRef, narrativeTypes.selection, narrativeTypes.moment] as const;

export const scriptStudioTemporalDomains: readonly StudioTemporalDomainCompanion[] = [{
  id: "script",
  match: { module: scriptModuleRef, declaration: "script" },
  valueTypes: [narrativeTypes.narrative, narrativeTemporalTypes.narrativeProjection],
  sourceTypes: scriptTemporalSourceTypes,
  presentation: { family: "narrative", tone: "teal", icon: "brand" },
  identify({ type, value }) {
    if (!scriptTemporalSourceTypes.some((candidate) => sameType(candidate, type))) return undefined;
    const held = value as { readonly narrativeId?: unknown; readonly id?: unknown; readonly kind?: unknown };
    if (typeof held.narrativeId !== "string" || typeof held.id !== "string") return undefined;
    const kind = sameType(type, narrativeTypes.segmentRef) ? "segment"
      : sameType(type, narrativeTypes.selection) ? "selection"
      : sameType(type, narrativeTypes.moment) ? "moment"
      : typeof held.kind === "string" ? held.kind : undefined;
    return kind === undefined ? undefined : { domainId: held.narrativeId, kind, id: held.id };
  },
  project: projectScriptTemporalDomain,
  observe(input) {
    const narrativeId = input.attributes.id ?? "script";
    if (typeof narrativeId !== "string" || narrativeId.length === 0) return undefined;
    if (input.source === undefined || input.contentStart === undefined) return undefined;
    const closing = `</${input.tag}>`;
    const closeEnd = input.nextOffset;
    if (closeEnd === undefined) return undefined;
    const end = closeEnd - closing.length;
    if (end < input.contentStart || input.source.slice(end, closeEnd) !== closing) return undefined;
    const parsed = parseScript(input.sourceName, input.source.slice(input.contentStart, end), input.contentStart);
    return {
      domainId: narrativeId,
      sourcePath: input.sourceName,
      range: { start: input.range.start, end: closeEnd },
      content: { start: input.contentStart, end },
      data: {
        segments: parsed.segments.map((segment) => ({ id: segment.id, range: segment.range })),
        selections: parsed.selections.map((selection) => ({
          id: selection.id,
          startAnchorId: selection.startAnchorId,
          endAnchorId: selection.endAnchorId,
          open: selection.open.range,
          close: selection.close.range,
        })),
        moments: parsed.moments.map((moment) => ({ id: moment.id, anchorId: moment.anchorId, range: moment.range })),
        tokens: parsed.tokens.map((token) => ({ id: token.id, range: token.range })),
      },
    };
  },
  adjust(input) {
    const parsed = parseScript(input.sourceName, input.source);
    return input.adjustment.kind === "span"
      ? adjustScriptSelection({ sourceName: input.sourceName, source: input.source, parsed,
          adjustment: { id: input.adjustment.itemId, startAnchorId: input.adjustment.startAnchorId,
            endAnchorId: input.adjustment.endAnchorId } })
      : adjustScriptMoment({ sourceName: input.sourceName, source: input.source, parsed,
          adjustment: { id: input.adjustment.itemId, anchorId: input.adjustment.anchorId } });
  },
}];
