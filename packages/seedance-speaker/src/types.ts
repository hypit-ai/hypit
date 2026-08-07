import type { CanonicalValue, BlobRef } from "@svml/protocol";
import type { SeedanceModel } from "@svml/seedance";

export type SpeakerReference = {
  readonly kind: "image" | "audio";
  readonly artifact: BlobRef;
  readonly role: string;
};

export type SpeakerTakeIntent = {
  readonly contract: "svml.seedance-speaker-take-intent@1";
  readonly kit: string;
  readonly recipe: { readonly path: string };
  readonly model: SeedanceModel;
  readonly resolution: "480p" | "720p" | "1080p";
  readonly aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9" | "adaptive";
  readonly webSearch: boolean;
  readonly promptParameters: Readonly<Record<string, CanonicalValue>>;
  readonly segment: {
    readonly dialogue: string;
  };
  readonly references: readonly SpeakerReference[];
  readonly actionPrompt?: string;
  readonly extraPrompt?: string;
};
