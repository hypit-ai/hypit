import { artifactTypes } from "@narratage/artifact";
import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import type { FragmentOperation } from "@narratage/elaborator";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import type { TypeRef } from "@narratage/protocol";
import { semanticMapTypes } from "@narratage/semantic-map";
import { spatialTypes } from "@narratage/spatial";

import { commentStickerProducers, commentStickerTypes } from "./manifest.js";

type TimedItem =
  | { readonly kind: "program" }
  | { readonly kind: "selection"; readonly mapName: string; readonly sourceName: string }
  | { readonly kind: "moment"; readonly mapName: string; readonly sourceName: string };

export type CommentStickerFragmentItem = TimedItem & {
  readonly specName: string;
  readonly frameName: string;
  readonly styleName: string;
  readonly avatarName?: string;
};

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function appendProducer(item: CommentStickerFragmentItem) {
  if (item.kind === "program") {
    return item.avatarName === undefined ? commentStickerProducers.appendProgram : commentStickerProducers.appendProgramAvatar;
  }
  if (item.kind === "selection") {
    return item.avatarName === undefined ? commentStickerProducers.appendSelection : commentStickerProducers.appendSelectionAvatar;
  }
  return item.avatarName === undefined ? commentStickerProducers.appendMoment : commentStickerProducers.appendMomentAvatar;
}

export function createCommentStickerFragment(items: readonly CommentStickerFragmentItem[], name: string) {
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
    types.set(item.frameName, spatialTypes.frame);
    types.set(item.styleName, commentStickerTypes.style);
    if (item.avatarName !== undefined) types.set(item.avatarName, artifactTypes.blob);
    if (item.kind !== "program") {
      types.set(item.mapName, semanticMapTypes.complete);
      types.set(item.sourceName, item.kind === "selection" ? narrativeTypes.selection : narrativeTypes.moment);
    }
    const id = `comment:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id,
      producer: appendProducer(item),
      inputs: {
        set: operation(current),
        header: input("header"),
        frame: input(item.frameName),
        style: input(item.styleName),
        space: input("space"),
        spec: input(item.specName),
        ...(item.avatarName === undefined ? {} : { avatar: input(item.avatarName) }),
        ...(item.kind === "program" ? {} : {
          map: input(item.mapName),
          [item.kind]: input(item.sourceName),
        }),
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
      inputs: { canvas: input("canvas"), space: input("space"), program: operation("comment:program") },
      result: { kind: "output", name: "track" },
    },
  );
  const semanticInputs = ["canvas", "header", "space", ...types.keys()];
  return sealGraphFragment({
    name,
    inputs: [
      { name: "canvas", type: spatialTypes.canvas },
      { name: "header", type: commentStickerTypes.header },
      { name: "space", type: programSpaceTypes.programSpace },
      ...[...types].map(([inputName, type]) => ({ name: inputName, type })),
    ],
    operations,
    exports: [
      { name: "program", type: commentStickerTypes.program, root: operation("comment:program"), semanticInputs, fidelity: "exact" },
      { name: "track", type: compositionTypes.visualTrack, root: operation("comment:track"), semanticInputs, fidelity: "exact" },
    ],
  });
}
