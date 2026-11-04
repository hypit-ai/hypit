import { canonicalStringify, canonicalize } from "@hypit/hypit/protocol";

import { assertCaptionDocumentIdentity } from "./identity.js";
import { assertTemporalWindowFor } from "@hypit/timeline";
import type { TemporalWindow } from "@hypit/timeline";
import type { CaptionDocument, CaptionProgram, CaptionStyleIntent } from "./types.js";

const ID = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export function sealCaptionStyle(value: CaptionStyleIntent): CaptionStyleIntent {
  const result = canonicalize({
    id: value.id,
    rendering: value.rendering === null ? null
      : { family: value.rendering.family.trim(), parameters: canonicalize(value.rendering.parameters) },
  }) as unknown as CaptionStyleIntent;
  assertCaptionStyle(result);
  return result;
}

export function assertCaptionStyle(value: CaptionStyleIntent): void {
  assert(ID.test(value.id), "Caption Style identity is invalid");
  if (value.rendering === null) return;
  assert(value.rendering.family.trim().length > 0, `Caption Style ${value.id} rendering family is empty`);
  canonicalize(value.rendering.parameters);
}

export function sealCaptionProgram(value: CaptionProgram): CaptionProgram {
  const result = canonicalize(value) as unknown as CaptionProgram;
  assertCaptionProgram(result);
  return result;
}

export function assertCaptionProgram(value: CaptionProgram): void {
  assert(ID.test(value.id) && value.documentId.length > 0, "Caption Track identity is invalid");
  const styles = new Map(value.styles.map(style => [style.id, style]));
  assert(styles.size === value.styles.length, "Caption Styles are repeated");
  value.styles.forEach(assertCaptionStyle);
  assert(new Set(value.uses.map(use => use.id)).size === value.uses.length, "Caption Use ids are repeated");
  for (const use of value.uses) {
    assert(ID.test(use.id), "Caption Use identity is invalid");
    if (use.window !== undefined) assertTemporalWindowFor(use.window, {});
    assert(styles.has(use.styleId), "Caption Use references an unknown Style");
    assert(use.role === undefined || use.role.trim().length > 0, "Caption Role is empty");
  }
}
export function assertCaptionProgramForDocument(value: CaptionProgram, document: CaptionDocument): void {
  assertCaptionProgram(value);
  assertCaptionDocumentIdentity(document);
  assert(value.documentId === document.id, "Caption Uses belong to another CaptionDocument");
}
export function appendCaptionUse(program: CaptionProgram, id: string, window: TemporalWindow | undefined, style: CaptionStyleIntent, role?: string): CaptionProgram {
  const previous = program.styles.find(item => item.id === style.id);
  assert(previous === undefined || canonicalStringify(previous) === canonicalStringify(style), `Caption Style ${style.id} has conflicting definitions`);
  return sealCaptionProgram({ ...program,
    styles: previous === undefined ? [...program.styles, style] : program.styles,
    uses: [...program.uses, { id, ...(window === undefined ? {} : { window }), styleId: style.id, ...(role === undefined ? {} : { role }) }],
  });
}
