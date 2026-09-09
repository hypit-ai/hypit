import type { SemanticTake } from "@hypit/speech";
export type SpeechTrackHeader = { readonly id: string };
export type SpeechTrackTake = { readonly semantic: SemanticTake };
export type SpeechTrackSet = { readonly takes: readonly SpeechTrackTake[] };
export type SpeechTrackInput = { readonly takeName: string };
export type SpeechTrackFragmentOptions = { readonly takes: readonly SpeechTrackInput[] };
