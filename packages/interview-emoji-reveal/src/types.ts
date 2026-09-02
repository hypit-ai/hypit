import type { BlobRef } from "@hypit/protocol";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";

export type EmojiRevealHeader = { readonly id: string };

export type EmojiRevealItemSpec = {
  readonly id: string;
};

export type EmojiRevealStyle = {
  readonly id: string;
  readonly centerX: number;
  readonly topY: number;
  readonly slotSizePx: number;
  readonly gapPx: number;
  readonly paddingXPx: number;
  readonly paddingYPx: number;
  readonly background: string;
  readonly borderColor: string;
  readonly borderWidthPx: number;
  readonly radiusPx: number;
  readonly shadowColor: string;
  readonly shadowXPx: number;
  readonly shadowYPx: number;
  readonly shadowBlurPx: number;
  readonly shadowSpreadPx: number;
  readonly iconSizePx: number;
  readonly revealFrames: number;
  readonly stackingOrder: number;
};

export type EmojiRevealItem = {
  readonly spec: EmojiRevealItemSpec;
  readonly icon: BlobRef;
  readonly activation: TemporalInstant;
};

export type EmojiRevealSet = { readonly items: readonly EmojiRevealItem[] };

export type EmojiRevealProgram = {
  readonly id: string;
  readonly programSpaceId: string;
  readonly outer: TemporalWindow;
  readonly style: EmojiRevealStyle;
  readonly placeholder: BlobRef;
  readonly items: readonly EmojiRevealItem[];
};
