import { describe, expect, it } from "vitest";
import { formatBrief, hostKey, isThin, parsePage, sameHostUrl, seedPaths } from "./page.ts";

const html = `
<html>
  <head>
    <title>Harbor Brew</title>
    <meta name="description" content="Oat tin for weeknights." />
    <meta property="og:image" content="/og.png" />
    <script type="application/ld+json">{"@type":"Product","name":"Harbor oat tin"}</script>
  </head>
  <body>
    <h1>Harbor Brew</h1>
    <p>A small oat tin. No health claims.</p>
    <a href="/pricing">Pricing</a>
    <a href="https://other.example/x">Away</a>
    <a href="/login">Login</a>
    <a href="https://user:pass@harborbrew.example/secret">Secret</a>
  </body>
</html>
`;

describe("page explore", () => {
  it("reads title, offer text, structured data, and same-host links", () => {
    const card = parsePage("https://www.harborbrew.example/oat", html, "text/html");
    expect(card.title).toBe("Harbor Brew");
    expect(card.description).toContain("Oat tin");
    expect(card.jsonLd).toContain("Harbor oat tin");
    expect(card.text).toContain("No health claims");
    expect(card.links.map((link) => link.href)).toEqual(["https://www.harborbrew.example/pricing"]);
    expect(card.thin).toBe(false);
  });

  it("stays on the host and drops login or credential URLs", () => {
    expect(hostKey("www.harborbrew.example")).toBe("harborbrew.example");
    expect(sameHostUrl("https://harborbrew.example/oat", "/about")).toBe("https://harborbrew.example/about");
    expect(sameHostUrl("https://harborbrew.example/oat", "https://www.harborbrew.example/about")).toBe(
      "https://www.harborbrew.example/about",
    );
    expect(sameHostUrl("https://harborbrew.example/oat", "/login")).toBeUndefined();
    expect(sameHostUrl("https://harborbrew.example/oat", "https://user:pass@harborbrew.example/x")).toBeUndefined();
    expect(sameHostUrl("https://harborbrew.example/oat", "https://other.example/x")).toBeUndefined();
  });

  it("marks a JS shell as thin and seeds follow-up paths", () => {
    const shell = parsePage(
      "https://unbrowse.example/",
      `<html><title>Unbrowse</title><div id="app"></div><a href="/pricing">Pricing</a></html>`,
      "text/html",
    );
    expect(isThin(shell)).toBe(true);
    expect(seedPaths(shell.url, shell.links)).toEqual(
      expect.arrayContaining(["https://unbrowse.example/pricing", "https://unbrowse.example/about"]),
    );
  });

  it("writes a brief without invented facts", () => {
    const brief = formatBrief({
      product: "Harbor oat tin",
      facts: ["Sold as an oat tin", "No health claims"],
      gaps: "Price not on the fetched pages",
    });
    expect(brief).toContain("Product: Harbor oat tin");
    expect(brief).toContain("No health claims");
    expect(brief).toContain("Price not on the fetched pages");
    expect(brief).not.toContain("best");
  });
});
