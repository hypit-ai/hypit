export type AspectRatio = "9:16" | "16:9" | "1:1";
export type ProjectStatus = "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
export type ReviewState = "inbox" | "approved" | "rejected" | "sent";
export type SocialDestination = "tiktok" | "instagram" | "youtube" | "x";

export const SOCIAL_DESTINATIONS: readonly SocialDestination[] = ["tiktok", "instagram", "youtube", "x"];
export const FORMAT_IDS = [
  "talking-head",
  "narration-led",
  "presenter-led",
  "ranking",
  "short-drama",
  "street-interview",
  "podcast",
] as const;

export type ProjectInput = {
  title: string;
  prompt: string;
  aspectRatio: AspectRatio;
  duration: number;
  style: string;
  format?: string;
  referenceUrl?: string;
};

export type ProjectEvent = { id: string; type: string; message: string; createdAt: string };
export type Artifact = { id: string; name: string; url: string; mimeType: string };

export type Project = ProjectInput & {
  id: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  events: ProjectEvent[];
  artifacts: Artifact[];
  error?: string;
  review?: ReviewState;
  destinations?: SocialDestination[];
};

export type Job = {
  projectId: string;
  phase: "page" | "plan" | "image" | "video" | "merge" | "edit" | "store";
  prompt: string;
  aspectRatio: AspectRatio;
  duration: number;
  imageRequestId?: string;
  videoRequestId?: string;
  imageUrl?: string;
  videoUrl?: string;
  pageNote?: string;
  stillPrompt?: string;
  motionPrompt?: string;
  captions?: string;
  clips?: Array<{
    duration: number;
    motionPrompt: string;
    captions?: string;
    requestId?: string;
    videoUrl?: string;
  }>;
  clipIndex?: number;
  mergeRequestId?: string;
  editRequestId?: string;
  imageSkill?: string;
  videoSkill?: string;
  videoModel?: string;
  browserTaskId?: string;
};
