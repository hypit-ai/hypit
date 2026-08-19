import { readFile } from "node:fs/promises";

import { mediaTypes } from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { programSpaceTypes } from "@hypit/program-space";
import type { CanonicalValue, TypeRef } from "@hypit/protocol";
import { semanticMapTypes } from "@hypit/semantic-map";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import { textTypes } from "@hypit/text";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
} from "@hypit/markup";

import { createNotepadFragment } from "./fragment.js";
import type { NotepadFragmentRow } from "./fragment.js";
import { notepadTypes } from "./manifest.js";
import {
  assertNotepadRowSpec,
  sealNotepadHeader,
  sealNotepadRowShell,
  sealNotepadTitleSpec,
} from "./schedule.js";
import { decodeNotepadStyle } from "./style.js";
import type { NotepadRowMark, NotepadRowSpec } from "./types.js";

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function allowed(element: StructuredElement, names: readonly string[]): void {
  const permit = new Set(names);
  const unknown = Object.keys(element.attributes).filter((name) => !permit.has(name));
  if (unknown.length > 0) throw new Error(`${element.name} has unsupported attributes ${unknown.join(", ")}.`);
}

function empty(element: StructuredElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty.`);
  }
}

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value;
}

function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value;
}

function integer(element: StructuredElement, name: string): number | undefined {
  const source = optionalText(element, name);
  if (source === undefined) return undefined;
  const value = Number(source.trim());
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be an integer.`);
  return value;
}

function reference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: readonly TypeRef[],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !expected.some((type) => sameType(value.type, type))) {
    throw new Error(`${label} has the wrong Type.`);
  }
  return value;
}

function inline<T>(value: SurfaceResolvedReference, label: string): T {
  if (value.record?.value.kind !== "inline") throw new Error(`${label} must resolve during author compilation.`);
  return value.record.value.value as unknown as T;
}

export const decodeNotepadStyleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "recipe", "title-font", "emphasis-font", "row-font", "number-font"]);
  empty(element);
  const id = text(element, "id").trim();
  const recipe = reference(element.attributes.recipe, `${element.name}.recipe`, [svsRecipeType], resolveReference);
  const face = (attribute: string): FontArtifactRef | FontStackRef => inline<FontArtifactRef | FontStackRef>(
    reference(element.attributes[attribute], `${element.name}.${attribute}`,
      [mediaTypes.fontArtifact, mediaTypes.fontStack], resolveReference),
    `${element.name}.${attribute}`,
  );
  const style = decodeNotepadStyle(inline<SvsRecipe>(recipe, `${element.name}.recipe`), {
    lead: face("title-font"),
    emphasis: face("emphasis-font"),
    row: face("row-font"),
    ...(element.attributes["number-font"] === undefined ? {} : { number: face("number-font") }),
  });
  return {
    records: [{
      id, type: notepadTypes.style,
      value: { kind: "inline", value: style as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [], fragments: [],
  };
};

function localName(element: StructuredElement): string {
  return element.name.slice(element.name.lastIndexOf(":") + 1);
}

function rowValue(
  element: StructuredElement,
  suffix: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): { readonly spec: NotepadRowSpec | Omit<NotepadRowSpec, "label">; readonly content?: SurfaceResolvedReference } {
  allowed(element, ["id", "rank", "label", "mark", "stack"]);
  empty(element);
  const id = optionalText(element, "id")?.trim() ?? `row-${suffix}`;
  const rank = integer(element, "rank");
  if (rank === undefined) throw new Error(`${element.name}.rank is required.`);
  const mark = (optionalText(element, "mark")?.trim() ?? "none") as NotepadRowMark;
  if (mark !== "none" && mark !== "circle") throw new Error(`${element.name}.mark must be none or circle.`);
  const stackingOrder = integer(element, "stack");
  const shell = { id, rank, mark, ...(stackingOrder === undefined ? {} : { stackingOrder }) };
  const raw = element.attributes.label;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const spec: NotepadRowSpec = { ...shell, label: raw.trim() };
    assertNotepadRowSpec(spec);
    return { spec };
  }
  return {
    spec: sealNotepadRowShell(shell),
    content: reference(raw, `${element.name}.label`, [textTypes.text], resolve),
  };
}

export const decodeNotepadListSurface: StructuredSurfaceHandler = async ({ element, resolveReference, resolveAsset }) => {
  allowed(element, [
    "id", "map", "space", "frame", "surface", "during", "triggers", "terminal",
    "opening", "title", "title-emphasis", "style",
  ]);
  const id = text(element, "id").trim();
  const records: SurfaceRecordDraft[] = [];
  const headerId = `${id}.header`;
  records.push({
    id: headerId, type: notepadTypes.header,
    value: { kind: "inline", value: sealNotepadHeader({ id }) as unknown as CanonicalValue },
    range: element.range,
  });
  const titleId = `${id}.title`;
  records.push({
    id: titleId, type: notepadTypes.title,
    value: {
      kind: "inline",
      value: sealNotepadTitleSpec({
        lead: text(element, "title"),
        emphasis: optionalText(element, "title-emphasis") ?? "",
      }) as unknown as CanonicalValue,
    },
    range: element.range,
  });

  const map = reference(element.attributes.map, `${element.name}.map`, [semanticMapTypes.complete], resolveReference);
  const space = reference(element.attributes.space, `${element.name}.space`, [programSpaceTypes.programSpace], resolveReference);
  const frame = reference(element.attributes.frame, `${element.name}.frame`, [spatialTypes.frame], resolveReference);
  // The ruled paper is this component's own chrome, so it ships with the package
  // and is only overridden when a Source deliberately supplies another surface.
  let surfaceRef: { readonly kind: "record"; readonly id: string } | SurfaceResolvedReference["ref"];
  if (element.attributes.surface === undefined) {
    const bytes = Uint8Array.from(await readFile(new URL("../assets/paper.png", import.meta.url)));
    const resolved = await resolveAsset({
      from: "package:@hypit/local-notepad-list/paper.png",
      mediaType: "image/png",
      bytes,
      range: element.range,
    });
    const surfaceId = `${id}.surface`;
    records.push({
      id: surfaceId, type: mediaTypes.blobArtifact,
      // A blob is a StoredValue in its own right; wrapping it as an inline value
      // would hand the Producer a description of an Artifact instead of one.
      value: resolved.artifact,
      range: element.range,
    });
    surfaceRef = { kind: "record", id: surfaceId };
  } else {
    surfaceRef = reference(element.attributes.surface, `${element.name}.surface`, [mediaTypes.blobArtifact], resolveReference).ref;
  }
  const during = reference(element.attributes.during, `${element.name}.during`, [narrativeTypes.selection], resolveReference);
  const triggers = reference(element.attributes.triggers, `${element.name}.triggers`, [narrativeTypes.moment], resolveReference);
  const terminal = reference(element.attributes.terminal, `${element.name}.terminal`, [narrativeTypes.moment], resolveReference);
  const style = reference(element.attributes.style, `${element.name}.style`, [notepadTypes.style], resolveReference);
  const hasOpening = element.attributes.opening !== undefined;
  const opening = hasOpening
    ? reference(element.attributes.opening, `${element.name}.opening`, [narrativeTypes.selection], resolveReference)
    : undefined;

  const inputs: Record<string, typeof map.ref> = {
    header: { kind: "record", id: headerId },
    title: { kind: "record", id: titleId },
    map: map.ref, space: space.ref, frame: frame.ref, surface: surfaceRef,
    during: during.ref, triggers: triggers.ref, terminal: terminal.ref, style: style.ref,
    ...(opening === undefined ? {} : { opening: opening.ref }),
  };

  const rows: NotepadFragmentRow[] = [];
  const rowIds = new Set<string>();
  let index = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts Row children only.`);
      continue;
    }
    if (localName(child) !== "Row") throw new Error(`${element.name} accepts Row children only.`);
    index += 1;
    const suffix = String(index).padStart(4, "0");
    const authored = rowValue(child, suffix, resolveReference);
    if (rowIds.has(authored.spec.id)) throw new Error(`${element.name} has duplicate Row id ${authored.spec.id}.`);
    rowIds.add(authored.spec.id);
    const specId = `${id}.row.${suffix}.spec`;
    const specName = `row-${suffix}-spec`;
    records.push({
      id: specId,
      type: authored.content === undefined ? notepadTypes.rowSpec : notepadTypes.rowShell,
      value: { kind: "inline", value: authored.spec as unknown as CanonicalValue },
      range: child.range,
    });
    inputs[specName] = { kind: "record", id: specId };
    const contentName = authored.content === undefined ? undefined : `row-${suffix}-content`;
    if (authored.content !== undefined) inputs[contentName!] = authored.content.ref;
    rows.push({ suffix, specName, ...(contentName === undefined ? {} : { contentName }) });
  }
  if (rows.length === 0) throw new Error(`${element.name} requires at least one Row.`);

  const fragment = createNotepadFragment(rows, hasOpening);
  return {
    records,
    components: [{
      id, fragment: fragment.id, inputs,
      outputs: { schedule: `${id}.schedule`, program: `${id}.program`, visual: `${id}.visual` },
      range: element.range,
    }],
    fragments: [fragment],
  };
};
