export type AspectRatio = "9:16" | "16:9" | "1:1";

export type ProjectStatus = "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";

export type ReviewState = "inbox" | "approved" | "rejected" | "sent";

export type SocialDestination = "tiktok" | "instagram" | "youtube" | "x";

export const SOCIAL_DESTINATIONS: readonly SocialDestination[] = ["tiktok", "instagram", "youtube", "x"];

export type ProjectInput = {
  title: string;
  prompt: string;
  aspectRatio: AspectRatio;
  duration: number;
  style: string;
  format?: string;
  referenceUrl?: string;
};

export type ProjectEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

export type Artifact = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
};

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
