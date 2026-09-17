import { describe, expect, it } from "vitest";
import { inReview, mergeProjects, parseProject, upsertProject } from "./types.ts";

function project(partial: Record<string, unknown>) {
  return parseProject({
    id: "11111111-1111-1111-1111-111111111111",
    title: "Harbor brew",
    prompt: "A tin on the counter.",
    aspectRatio: "9:16",
    duration: 20,
    style: "Talking-head UGC",
    status: "completed",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:01.000Z",
    events: [],
    artifacts: [{ id: "a", name: "out.mp4", url: "/api/projects/x/artifacts/a", mimeType: "video/mp4" }],
    destinations: [],
    ...partial,
  });
}

describe("projects", () => {
  it("treats completed video without review as inbox", () => {
    expect(inReview(project({}))).toBe(true);
    expect(inReview(project({ review: "approved" }))).toBe(false);
  });

  it("keeps a newer local run when a stale list arrives", () => {
    const local = project({ updatedAt: "2026-09-17T00:00:10.000Z", status: "running" });
    const stale = project({ updatedAt: "2026-09-17T00:00:01.000Z", status: "queued" });
    expect(mergeProjects([local], [stale])[0]?.status).toBe("running");
  });

  it("force upserts a review decision even if timestamps invert", () => {
    const older = project({ updatedAt: "2026-09-17T00:00:10.000Z", review: "inbox" });
    const patched = project({ updatedAt: "2026-09-17T00:00:01.000Z", review: "approved" });
    expect(upsertProject([older], patched, true)[0]?.review).toBe("approved");
  });
});
