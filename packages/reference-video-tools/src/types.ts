/**
 * `pending` is not a failure: it is an observation the `agent` observer has been handed and has not
 * answered yet. It is never cached, so the work survives the process that reported it.
 */
export type Observation = { readonly status: "complete" | "failed" | "pending"; readonly text: string };

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
  /**
    * The shot's frames sampled evenly and tiled into one picture, in reading order. Built for the
    * `agent` observer, which reads it in place of the clip, and null for the observer that reads video.
    */
  readonly frames_tile_ref: string | null;
  readonly audio_tail_ref: string | null;
};

/**
 * Who reads the reference. `gemini` uploads video to Vertex; `agent` hands the main agent one tiled
 * picture per shot and takes the answer back. The two produce the same observation keys.
 */
export type Observer = "gemini" | "agent";

/** One observation the `agent` observer still owes, carrying everything needed to answer it. */
export type ObservationTaskRequest = {
  readonly key: string;
  readonly instruction: string;
  readonly prompt: string;
  readonly image_refs: readonly string[];
};

export type ReferenceState = {
  readonly reference_id: string;
  readonly video_path: string;
  readonly root: string;
  readonly observer?: Observer;
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
  readonly observer?: Observer;
  /** Observations the `agent` observer still owes. Empty on the `gemini` observer. */
  readonly pending_observations?: readonly ObservationTaskRequest[];
  readonly video: ReferenceState["video"];
  readonly shots: readonly Shot[];
  readonly storyboard_ref: string;
  readonly transcript: Transcript;
  readonly people_and_product: Observation;
  readonly voices: Observation;
  readonly persistent_systems: Observation;
  readonly places: Observation;
};
