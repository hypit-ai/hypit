import { artifactTypes } from "@hypit/artifact";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { narrativeTypes } from "@hypit/narrative";
import type { TypeRef } from "@hypit/protocol";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import { textTypes } from "@hypit/text";
import { temporalProducers, temporalTypes } from "@hypit/temporal";

import { commentStickerProducers, commentStickerTypes } from "./manifest.js";

type TimedItem =
  | { readonly kind: "program" }
  | { readonly kind: "selection"; readonly sourceName: string }
  | { readonly kind: "moment"; readonly sourceName: string };

export type CommentStickerFragmentItem = TimedItem & {
  readonly windowSpecName: string;
  readonly specName: string;
  readonly frameName: string;
  readonly styleName: string;
  readonly avatarName?: string;
  readonly commentName: string;
  readonly authorName?: string;
  readonly headerTextName?: string;
  readonly metaName?: string;
};

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function appendProducer(item: CommentStickerFragmentItem) {
  return item.avatarName === undefined ? commentStickerProducers.appendItem : commentStickerProducers.appendItemAvatar;
}

export function createCommentStickerFragment(items: readonly CommentStickerFragmentItem[]) {
  if (items.length === 0) throw new Error("Comment Sticker Fragment requires at least one Item.");
  const types = new Map<string, TypeRef>();
  const operations: FragmentOperation[] = [{
    id: "comment:set:empty",
    producer: commentStickerProducers.createSet,
    inputs: {},
    result: { kind: "output", name: "set" },
  }];
  let current = "comment:set:empty";
  items.forEach((item, index) => {
    types.set(item.specName, commentStickerTypes.itemSpec);
    types.set(item.windowSpecName, temporalTypes.windowSpec);
    types.set(item.frameName, spatialTypes.frame);
    types.set(item.styleName, commentStickerTypes.style);
    types.set(item.commentName, textTypes.text);
    if (item.authorName !== undefined) types.set(item.authorName, textTypes.text);
    if (item.headerTextName !== undefined) types.set(item.headerTextName, textTypes.text);
    if (item.metaName !== undefined) types.set(item.metaName, textTypes.text);
    if (item.avatarName !== undefined) types.set(item.avatarName, artifactTypes.blob);
    if (item.kind !== "program") {
      types.set(item.sourceName, item.kind === "selection" ? narrativeTypes.selection : narrativeTypes.moment);
    }
    const suffix = String(index + 1).padStart(4, "0");
    const createContentId = `comment:content:${suffix}:create`;
    operations.push({
      id: createContentId,
      producer: commentStickerProducers.createContent,
      inputs: { comment: input(item.commentName) },
      result: { kind: "output", name: "content" },
    });
    let content = operation(createContentId);
    for (const [field, name, producer] of [
      ["author", item.authorName, commentStickerProducers.setContentAuthor],
      ["header", item.headerTextName, commentStickerProducers.setContentHeader],
      ["meta", item.metaName, commentStickerProducers.setContentMeta],
    ] as const) {
      if (name === undefined) continue;
      const fieldId = `comment:content:${suffix}:${field}`;
      operations.push({
        id: fieldId,
        producer,
        inputs: { content, [field]: input(name) },
        result: { kind: "output", name: "content" },
      });
      content = operation(fieldId);
    }
    const id = `comment:set:append:${suffix}`;
    const windowId = `comment:window:${suffix}`;
    const windowProducer = item.kind === "program" ? temporalProducers.projectProgram
      : item.kind === "selection" ? temporalProducers.projectSelection : temporalProducers.projectMoment;
    operations.push({ id: windowId, producer: windowProducer, inputs: {
      semantic: input("semantic"), spec: input(item.windowSpecName),
      ...(item.kind === "program" ? {} : { [item.kind]: input(item.sourceName) }),
    }, result: { kind: "output", name: "window" } });
    operations.push({
      id,
      producer: appendProducer(item),
      inputs: {
        set: operation(current),
        header: input("header"),
        frame: input(item.frameName),
        style: input(item.styleName),
        semantic: input("semantic"), window: operation(windowId),
        spec: input(item.specName),
        content,
        ...(item.avatarName === undefined ? {} : { avatar: input(item.avatarName) }),
      },
      result: { kind: "output", name: "set" },
    });
    current = id;
  });
  operations.push(
    {
      id: "comment:program",
      producer: commentStickerProducers.finalize,
      inputs: { set: operation(current), header: input("header") },
      result: { kind: "output", name: "program" },
    },
    {
      id: "comment:track",
      producer: commentStickerProducers.render,
      inputs: { canvas: input("canvas"), semantic: input("semantic"), program: operation("comment:program") },
      result: { kind: "output", name: "track" },
    },
  );
  return sealGraphFragment({
    inputs: [
      { name: "canvas", type: spatialTypes.canvas },
      { name: "header", type: commentStickerTypes.header },
      { name: "semantic", type: semanticTrackTypes.track },
      ...[...types].map(([inputName, type]) => ({ name: inputName, type })),
    ],
    operations,
    exports: [
      { name: "program", type: commentStickerTypes.program, root: operation("comment:program") },
      { name: "track", type: compositionTypes.visualTrack, root: operation("comment:track") },
    ],
  });
}
