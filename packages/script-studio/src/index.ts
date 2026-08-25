import { adjustScriptMoment, adjustScriptSelection, parseScript, scriptModuleRef } from "@hypit/script";
import type { StudioScriptCompanion } from "@hypit/studio-adapter";

export const scriptStudioCompanions: readonly StudioScriptCompanion[] = [{
  id: "script",
  match: { module: scriptModuleRef, surface: "script" },
  observe(input) {
    const narrativeId = input.attributes.id ?? "script";
    if (typeof narrativeId !== "string" || narrativeId.length === 0) return undefined;
    const closing = `</${input.tag}>`;
    const closeEnd = input.nextOffset;
    if (closeEnd === undefined) return undefined;
    const end = closeEnd - closing.length;
    if (end < input.contentStart || input.source.slice(end, closeEnd) !== closing) return undefined;
    const parsed = parseScript(
      input.sourceName,
      input.source.slice(input.contentStart, end),
      input.contentStart,
    );
    return {
      narrativeId,
      sourcePath: input.sourceName,
      range: { start: input.openingStart, end: closeEnd },
      content: { start: input.contentStart, end },
      segments: parsed.segments.map((segment) => ({ id: segment.id, range: segment.range })),
      selections: parsed.selections.map((selection) => ({
        id: selection.id,
        startAnchorId: selection.startAnchorId,
        endAnchorId: selection.endAnchorId,
        open: selection.open.range,
        close: selection.close.range,
      })),
      moments: parsed.moments.map((moment) => ({
        id: moment.id,
        anchorId: moment.anchorId,
        range: moment.range,
      })),
      tokens: parsed.tokens.map((token) => ({ id: token.id, range: token.range })),
    };
  },
  adjust(input) {
    const parsed = parseScript(input.sourceName, input.source);
    return input.adjustment.kind === "selection"
      ? adjustScriptSelection({
          sourceName: input.sourceName,
          source: input.source,
          parsed,
          adjustment: {
            id: input.adjustment.id,
            startAnchorId: input.adjustment.startAnchorId,
            endAnchorId: input.adjustment.endAnchorId,
          },
        })
      : adjustScriptMoment({
          sourceName: input.sourceName,
          source: input.source,
          parsed,
          adjustment: { id: input.adjustment.id, anchorId: input.adjustment.anchorId },
        });
  },
}];
