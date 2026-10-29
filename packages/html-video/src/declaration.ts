import {
  declarationField,
  type AuthorDeclarationBinding,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { blobTypes } from "@hypit/hypit/blob";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { assertFrameSpan, timelineTypes } from "@hypit/timeline";

import { htmlVideoDeliverySpec } from "./delivery.js";
import { createHtmlVideoFragment } from "./fragment.js";
import { htmlVideoModuleRef } from "./manifest.js";

type DeclarationNode = Parameters<typeof declarationField>[0];

function field(declaration: DeclarationNode, name: string) {
  return declarationField(declaration, name);
}

function literal(declaration: DeclarationNode, name: string): string {
  const value = field(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${declaration.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

async function resolved(
  declaration: DeclarationNode,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(declaration, name);
  if (value?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, type)) throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  return reference;
}

function frame(declaration: DeclarationNode, name: string): number {
  const value = literal(declaration, name);
  if (!/^\d+$/u.test(value)) throw new Error(`${declaration.name}.${name} must be a non-negative integer.`);
  return Number(value);
}

function outputBinding(component: string): AuthorDeclarationBinding {
  return {
    name: `${component}.video`,
    ref: { kind: "component-output", component, output: "video" },
    type: blobTypes.blob,
  };
}

export const htmlVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: htmlVideoModuleRef,
  declaration: "video",
  outputs: [blobTypes.blob, mediaTypes.delivery, timelineTypes.frameSpan],
  shape: {
    summary: "Requests one final video from a Composition and its owned Timeline.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the video component." },
      { name: "composition", kind: "reference", required: true, accepts: [compositionTypes.composition], summary: "Selects the picture and sound." },
      { name: "delivery", kind: "reference", required: false, accepts: [mediaTypes.delivery], summary: "Selects an explicit delivery requirement." },
      { name: "quality", kind: "literal", required: false, values: ["draft", "standard", "high"], summary: "Constructs a standard HTML video delivery requirement." },
      { name: "start-frame", kind: "literal", required: false, summary: "Selects the first rendered source frame." },
      { name: "end-frame-exclusive", kind: "literal", required: false, summary: "Selects the first excluded source frame." },
    ],
  },
  bindings(declaration) {
    return [outputBinding(literal(declaration, "id"))];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const composition = await resolved(declaration, "composition", compositionTypes.composition, resolveReference);
    if (field(declaration, "delivery") !== undefined && field(declaration, "quality") !== undefined) {
      throw new Error(`${declaration.name} cannot combine delivery and quality.`);
    }
    const records = [];
    const deliveryId = `${id}.delivery`;
    const delivery = field(declaration, "delivery") === undefined
      ? { kind: "record" as const, id: deliveryId }
      : (await resolved(declaration, "delivery", mediaTypes.delivery, resolveReference)).ref;
    if (field(declaration, "delivery") === undefined) {
      const quality = field(declaration, "quality") === undefined ? "standard" : literal(declaration, "quality");
      records.push({
        id: deliveryId,
        type: mediaTypes.delivery,
        value: htmlVideoDeliverySpec(quality as "draft" | "standard" | "high"),
        range: declaration.range,
      });
    }
    const hasStart = field(declaration, "start-frame") !== undefined;
    const hasEnd = field(declaration, "end-frame-exclusive") !== undefined;
    if (hasStart !== hasEnd) throw new Error(`${declaration.name} requires both frame bounds.`);
    const selected = hasStart;
    const rangeId = `${id}.frame-range`;
    if (selected) {
      const range = {
        startFrame: frame(declaration, "start-frame"),
        endFrameExclusive: frame(declaration, "end-frame-exclusive"),
      };
      assertFrameSpan(range);
      records.push({ id: rangeId, type: timelineTypes.frameSpan, value: range, range: declaration.range });
    }
    return {
      records,
      components: [{
        id,
        fragment: createHtmlVideoFragment(selected),
        inputs: {
          composition: composition.ref,
          delivery,
          ...(selected ? { range: { kind: "record" as const, id: rangeId } } : {}),
        },
        outputs: { video: `${id}.video` },
        range: declaration.range,
      }],
    };
  },
};

export const htmlVideoAuthorDeclarations = [htmlVideoAuthorDeclaration] as const;

export const htmlVideoMarkupDeclarations = [{ name: "video", tag: "Video" }] as const;
