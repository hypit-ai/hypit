import { describe, expect, it } from "vitest";
import { allowedDomains, briefFromBrowser, exploreTask, pageKey } from "./browser-use.ts";

describe("browser use", () => {
  it("shares one browse key for www and trailing slash", () => {
    expect(pageKey("https://www.unbrowse.ai/")).toBe(pageKey("https://unbrowse.ai"));
    expect(allowedDomains("https://www.unbrowse.ai/pricing")).toEqual(["unbrowse.ai", "www.unbrowse.ai"]);
  });

  it("forbids login work in the browse task", () => {
    const task = exploreTask("https://unbrowse.ai/");
    expect(task).toContain("https://unbrowse.ai/");
    expect(task).toContain("Do not log in");
    expect(task).toContain("Invent no claims");
  });

  it("reads a structured Browser Use result into a facts-only brief", () => {
    const result = briefFromBrowser(
      {
        id: "task",
        status: "finished",
        output: JSON.stringify({
          product: "Unbrowse",
          facts: ["Route layer for web agents"],
          gaps: "Price not on the pages opened",
          pages: ["https://unbrowse.ai/", "https://unbrowse.ai/docs"],
        }),
        steps: [{ url: "https://unbrowse.ai/" }, { url: "https://unbrowse.ai/docs" }],
      },
      "https://unbrowse.ai/",
    );
    expect(result.brief).toContain("Product: Unbrowse");
    expect(result.brief).toContain("Route layer for web agents");
    expect(result.brief).not.toContain("best AI");
    expect(result.summary).toContain("Browser Use explored 2 pages");
    expect(result.hops).toEqual(["https://unbrowse.ai/", "https://unbrowse.ai/docs"]);
  });
});
