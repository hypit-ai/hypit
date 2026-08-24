import { narrativeTypes } from "@hypit/narrative";
import type { CaptionDocument, Narrative, NarrativeSelection } from "@hypit/narrative";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/markup";

import { captionTypes } from "./manifest.js";
import { captionUnitsForRole, captionUnitsForSelection, captionWordsForAttribute } from "./display.js";
import { resolveCaptionProgram } from "./style.js";
import type { CaptionMuteApplication, CaptionStyleApplication, CaptionStyleIntent, CaptionWordStyleApplication } from "./types.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}
function attributes(element: StructuredElement, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(element.attributes);
  if (required.some((name) => element.attributes[name] === undefined) || actual.some((name) => !allowed.has(name))) {
    throw new Error(`${element.name} requires ${required.join(", ")}${optional.length ? `; optional: ${optional.join(", ")}` : ""}`);
  }
}
function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a non-empty string`);
  return value.trim();
}
function optionalString(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a non-empty string`);
  return value.trim();
}
function reference(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a whole-value reference`);
  const value = resolveReference(raw.path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${raw.path}`);
  if (!sameType(value.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return value;
}
function inline<T>(referenceValue: SurfaceResolvedReference, subject: string): T {
  if (referenceValue.record?.value.kind !== "inline") throw new Error(`${subject} must reference an authored inline Record`);
  return referenceValue.record.value.value as unknown as T;
}
function localName(name: string): string { const index = name.lastIndexOf(":"); return index < 0 ? name : name.slice(index + 1); }

export const decodeCaptionProgramSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "document", "narrative", "default"]);
  const id = stringAttribute(element, "id");
  const document = inline<CaptionDocument>(reference(element, "document", narrativeTypes.captionDocument, resolveReference), `${element.name}.document`);
  const narrative = inline<Narrative>(reference(element, "narrative", narrativeTypes.narrative, resolveReference), `${element.name}.narrative`);
  const defaultStyle = inline<CaptionStyleIntent>(reference(element, "default", captionTypes.style, resolveReference), `${element.name}.default`);
  const applications: CaptionStyleApplication[] = [];
  const wordApplications: CaptionWordStyleApplication[] = [];
  const mutes: CaptionMuteApplication[] = [];
  for (const child of element.children) {
    if (child.kind === "text") { if (child.value.trim()) throw new Error(`${element.name} accepts only Use or Mute children`); continue; }
    const childName = localName(child.name);
    if (childName !== "Use" && childName !== "Mute") throw new Error(`${element.name} accepts only Use or Mute children`);
    attributes(child, childName === "Use" ? ["style"] : [], ["role", "selection", "attribute"]);
    const role = optionalString(child, "role");
    const attribute = optionalString(child, "attribute");
    const selectionRaw = child.attributes.selection;
    const selectors = [role !== undefined, selectionRaw !== undefined, attribute !== undefined].filter(Boolean).length;
    if (selectors !== 1) throw new Error(`${child.name} requires exactly one of role, selection or attribute`);
    if (childName === "Mute" && attribute !== undefined) throw new Error(`${child.name} cannot mute a token attribute`);
    if (attribute !== undefined) {
      const wordIds = captionWordsForAttribute(document, attribute);
      wordApplications.push({
        id: `${id}.word-use.${wordApplications.length + 1}`,
        attribute,
        wordIds,
        style: inline<CaptionStyleIntent>(reference(child, "style", captionTypes.style, resolveReference), `${child.name}.style`),
      });
      continue;
    }
    const unitIds = role !== undefined
      ? captionUnitsForRole(document, role).unitIds
      : captionUnitsForSelection(
          document,
          narrative,
          inline<NarrativeSelection>(reference(child, "selection", narrativeTypes.selection, resolveReference), `${child.name}.selection`),
        ).unitIds;
    if (childName === "Mute") mutes.push({ id: `${id}.mute.${mutes.length + 1}`, unitIds });
    else applications.push({
      id: `${id}.use.${applications.length + 1}`,
      unitIds,
      style: inline<CaptionStyleIntent>(reference(child, "style", captionTypes.style, resolveReference), `${child.name}.style`),
    });
  }
  const program = resolveCaptionProgram(document, narrative, id, defaultStyle, applications, mutes, wordApplications);
  return { records: [{ id, type: captionTypes.program, value: { kind: "inline", value: program }, range: element.range }], components: [], fragments: [] };
};
