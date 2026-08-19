import { narrativeTypes } from "@hypit/narrative";
import type { CaptionDisplaySequence, CaptionDisplayWordSubset } from "@hypit/narrative";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";

import { captionTypes } from "./manifest.js";
import { captionWordsForRole } from "./display.js";
import { resolveCaptionProgram } from "./style.js";
import type { CaptionMuteApplication, CaptionStyleApplication } from "./style.js";
import type { CaptionStyleIntent } from "./types.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function attributes(element: StructuredElement, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(element.attributes);
  if (required.some((name) => element.attributes[name] === undefined) || actual.some((name) => !allowed.has(name))) {
    throw new Error(
      `${element.name} requires ${required.join(", ")}${optional.length ? `; optional: ${optional.join(", ")}` : ""}`,
    );
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
  if (typeof raw !== "object" || raw.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  const value = resolveReference(raw.path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${raw.path}`);
  if (!sameType(value.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return value;
}

function inline<T>(reference: SurfaceResolvedReference, subject: string): T {
  if (reference.record?.value.kind !== "inline") throw new Error(`${subject} must reference an authored inline Record`);
  return reference.record.value.value as unknown as T;
}

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

/**
 * Resolve one complete word assignment at author-compilation time. Script has already projected
 * Selection syntax to CaptionDisplayWordSubset data; this Surface lowers Role sugar from the same sequence.
 */
export const decodeCaptionProgramSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "display", "default"]);
  const id = stringAttribute(element, "id");
  const sequence = inline<CaptionDisplaySequence>(
    reference(element, "display", narrativeTypes.captionDisplay, resolveReference),
    `${element.name}.display`,
  );
  const defaultStyle = inline<CaptionStyleIntent>(
    reference(element, "default", captionTypes.style, resolveReference),
    `${element.name}.default`,
  );
  const applications: CaptionStyleApplication[] = [];
  const mutes: CaptionMuteApplication[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Use or Mute children`);
      continue;
    }
    const childName = localName(child.name);
    if (childName !== "Use" && childName !== "Mute") {
      throw new Error(`${element.name} accepts only Use or Mute children`);
    }
    attributes(child, childName === "Use" ? ["style"] : [], ["role", "words"]);
    const role = optionalString(child, "role");
    const wordsAttribute = child.attributes.words;
    if ((role === undefined) === (wordsAttribute === undefined)) {
      throw new Error(`${child.name} requires exactly one of role or words`);
    }
    const words = role === undefined
      ? inline<CaptionDisplayWordSubset>(
          reference(child, "words", narrativeTypes.captionDisplayWordSubset, resolveReference),
          `${child.name}.words`,
        )
      : captionWordsForRole(sequence, role);
    if (childName === "Mute") {
      mutes.push({ id: `${id}.mute.${mutes.length + 1}`, words });
    } else {
      applications.push({
        id: `${id}.use.${applications.length + 1}`,
        words,
        style: inline<CaptionStyleIntent>(
          reference(child, "style", captionTypes.style, resolveReference),
          `${child.name}.style`,
        ),
      });
    }
  }
  const program = resolveCaptionProgram(sequence, id, defaultStyle, applications, mutes);
  return {
    records: [{ id, type: captionTypes.program, value: { kind: "inline", value: program }, range: element.range }],
    components: [],
    fragments: [],
  };
};
