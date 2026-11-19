import { componentItem, projectSourceRange } from "@hypit/nle/authoring";
import { compareExactTemporalValues as compare, subtractExactTemporalValues as subtract } from "@hypit/temporal/algebra";

const component = { package: "@hypit/caption-fine", symbol: "fine" };

export function captionItemFromScriptCue(cue, placement, { id, documentId, picture, style, window = cue.window }) {
  const cueId = `${documentId}:cue:${cue.id}`;
  if (compare(window.start, cue.window.start) > 0 || compare(window.end, cue.window.end) < 0) {
    throw new Error(`Fine Caption ${cueId} visibility must contain its spoken time.`);
  }
  const wordId = (unit, index) => `${documentId}:unit:${unit}:word:${index + 1}`;
  const unitId = unit => `${documentId}:unit:${unit}`;
  const range = projectSourceRange(window, placement, cueId);
  const duration = subtract(range.end, range.start);
  if (compare(range.start, range.end) >= 0) throw new Error(`Fine Caption ${cueId} needs a positive visibility duration.`);
  const units = cue.units.map(unit => {
    const { start, end } = projectSourceRange(unit.window, placement, unitId(unit.id));
    return { id: unitId(unit.id), wordIds: unit.words.map((_word, index) => wordId(unit.id, index)),
      start: subtract(start, range.start), end: subtract(end, range.start) };
  });
  const words = cue.units.flatMap(({ id: unit, words }, unitIndex) => words.map((word, index) => ({
    ...word, id: wordId(unit, index), unitId: unitId(unit),
    separatorBefore: unitIndex === 0 && index === 0 ? "" : word.separatorBefore,
  })));
  return componentItem({ id, at: range.start, duration, role: "subtitle", component, picture,
    valueBindings: [{ ...style, slot: "style" }],
    parameters: { caption: { cueId, documentId, role: cue.role ?? "caption", units, words } } });
}
