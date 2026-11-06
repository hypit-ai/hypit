import {
  createAuthorDeclarationFacet,
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import { canonicalize } from "@hypit/hypit/protocol";
import { audiovisualTypes } from "@hypit/audiovisual";
import { exactTemporalValue } from "@hypit/temporal/algebra";

import { titleCardSourceFragment } from "./fragment.js";
import { titleCardModuleRef, titleCardTypes } from "./manifest.js";
import type { TitleCardSpec } from "./source.js";

function label(declaration: AuthorDeclaration): string {
  if (declaration.label === undefined || declaration.label.trim().length === 0) {
    throw new Error("Title Card requires a non-empty label.");
  }
  return declaration.label;
}

function literal(declaration: AuthorDeclaration, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`Title Card ${label(declaration)}.${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

function integer(declaration: AuthorDeclaration, name: string): number {
  const value = Number(literal(declaration, name).replace(/px$/u, ""));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Title Card ${label(declaration)}.${name} must be a positive integer.`);
  }
  return value;
}

function duration(declaration: AuthorDeclaration) {
  const value = literal(declaration, "duration");
  const match = /^(\d+)(?:\.(\d+))?(ms|s)$/u.exec(value);
  if (match === null) throw new Error(`Title Card ${label(declaration)}.duration must use seconds or milliseconds.`);
  const fraction = match[2] ?? "";
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(match[1]!) * scale + BigInt(fraction.length === 0 ? "0" : fraction);
  return exactTemporalValue({ numerator, denominator: scale * (match[3] === "ms" ? 1000n : 1n) });
}

export const titleCardAuthorDeclaration: AuthorDeclarationCompiler = {
  module: titleCardModuleRef,
  declaration: "Card",
  outputs: [audiovisualTypes.programSource, titleCardTypes.spec],
  shape: {
    summary: "Authors one project-owned audiovisual Title Card Source.",
    label: "required",
    fields: [
      { name: "duration", kind: "literal", required: true, summary: "Sets its exact local duration." },
      { name: "width", kind: "literal", required: true, summary: "Sets its Picture width." },
      { name: "height", kind: "literal", required: true, summary: "Sets its Picture height." },
      { name: "title", kind: "literal", required: true, summary: "Sets the title." },
      { name: "subtitle", kind: "literal", required: true, summary: "Sets the subtitle." },
      { name: "background", kind: "literal", required: true, summary: "Sets the background colour." },
      { name: "foreground", kind: "literal", required: true, summary: "Sets the foreground colour." },
    ],
  },
  bindings(declaration) {
    const id = label(declaration);
    return [{
      name: id,
      ref: { kind: "component-output", component: `${id}:title-card`, output: "source" },
      type: audiovisualTypes.programSource,
    }];
  },
  compile({ declaration }) {
    const id = label(declaration);
    const spec: TitleCardSpec = {
      id,
      duration: duration(declaration),
      width: integer(declaration, "width"),
      height: integer(declaration, "height"),
      title: literal(declaration, "title"),
      subtitle: literal(declaration, "subtitle"),
      background: literal(declaration, "background"),
      foreground: literal(declaration, "foreground"),
    };
    return {
      records: [{ id: `${id}:spec`, type: titleCardTypes.spec,
        value: canonicalize(spec), range: declaration.range }],
      components: [{
        id: `${id}:title-card`,
        fragment: titleCardSourceFragment,
        inputs: { spec: { kind: "record", id: `${id}:spec` } },
        outputs: { source: id },
        range: declaration.range,
      }],
    };
  },
};

export const titleCardAuthorFacet = createAuthorDeclarationFacet(titleCardAuthorDeclaration);
