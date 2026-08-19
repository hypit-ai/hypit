export type Observation = { readonly status: "complete" | "failed"; readonly text: string };

export type TranscriptWord = {
  readonly text: string;
  readonly start_seconds?: number;
  readonly end_seconds?: number;
  readonly score?: number;
};

export type TranscriptPassage = {
  readonly text: string;
  readonly start_seconds?: number;
  readonly end_seconds?: number;
  readonly words: readonly TranscriptWord[];
};

export type TranscriptFile = {
  readonly reference_id: string;
  readonly audio_ref: string;
  readonly passages: readonly TranscriptPassage[];
};

// A reference of any length has thousands of words, so the words live in their own file and the
// prepared result carries the path to them, as it does for the storyboard and the shot media.
export type Transcript = {
  readonly status: "complete" | "unavailable";
  readonly transcript_ref: string | null;
  readonly word_count: number;
  readonly reason?: string;
};

export type Shot = {
  readonly shot_id: string;
  readonly index: number;
  readonly start_seconds: number;
  readonly end_seconds: number;
  readonly duration_seconds: number;
  readonly initial_group: number;
  readonly part: number;
  readonly parts: number;
  readonly clip_ref: string;
  readonly representative_frame_ref: string;
  readonly tail_frame_ref: string;
  readonly audio_tail_ref: string | null;
};

export type ReferenceState = {
  readonly reference_id: string;
  readonly video_path: string;
  readonly root: string;
  readonly video: { readonly duration_seconds: number; readonly width: number; readonly height: number; readonly has_audio: boolean };
  readonly shots: readonly Shot[];
  readonly storyboard_ref: string;
  readonly analysis_video_ref: string;
  readonly transcript?: Transcript;
  readonly people_and_product?: Observation;
  readonly voices?: Observation;
  readonly persistent_systems?: Observation;
  readonly places?: Observation;
};

export type PrepareResult = {
  readonly reference_id: string;
  readonly status: "ready" | "partial";
  readonly video: ReferenceState["video"];
  readonly shots: readonly Shot[];
  readonly storyboard_ref: string;
  readonly transcript: Transcript;
  readonly people_and_product: Observation;
  readonly voices: Observation;
  readonly persistent_systems: Observation;
  readonly places: Observation;
};
