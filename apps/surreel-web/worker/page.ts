export type PageLink = { href: string; text: string };

export type PageCard = {
  url: string;
  status: number;
  title: string;
  description: string;
  ogImage: string;
  jsonLd: string;
  text: string;
  links: PageLink[];
  thin: boolean;
};

const SKIP_PATH = /(login|logout|signin|sign-up|signup|register|cart|checkout|account|admin|wp-admin|privacy|terms|cookie)/i;
const MAX_BODY = 400_000;
const FETCH_MS = 12_000;

export function hostKey(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

export function sameHostUrl(origin: string, href: string): string | undefined {
  let target: URL;
  try {
    target = new URL(href, origin);
  } catch {
    return undefined;
  }
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) return undefined;
  const root = new URL(origin);
  if (hostKey(target.hostname) !== hostKey(root.hostname)) return undefined;
  target.hash = "";
  if (SKIP_PATH.test(target.pathname)) return undefined;
  return target.toString();
}

export function isThin(card: Pick<PageCard, "text" | "description" | "jsonLd" | "title">): boolean {
  return card.text.length < 280 && card.description.length < 80 && card.jsonLd.length < 40;
}

export function parsePage(url: string, html: string, contentType: string, status = 200): PageCard {
  if (!/html|json|text\//i.test(contentType) && html.trim().startsWith("{")) {
    return {
      url,
      status,
      title: "",
      description: "",
      ogImage: "",
      jsonLd: html.slice(0, 2000),
      text: html.replace(/\s+/g, " ").trim().slice(0, 1800),
      links: [],
      thin: false,
    };
  }
  const title = attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s+/g, " ").trim();
  const description =
    meta(html, "description") || meta(html, "og:description") || meta(html, "twitter:description");
  const ogImage = meta(html, "og:image") || meta(html, "twitter:image");
  const jsonLd = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]!.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 2500);
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2400);
  const links: PageLink[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(match[1] ?? "")?.[1];
    if (!href) continue;
    const resolved = sameHostUrl(url, href);
    if (!resolved || seen.has(resolved) || resolved === stripHash(url)) continue;
    seen.add(resolved);
    const text = match[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    links.push({ href: resolved, text });
    if (links.length >= 40) break;
  }
  const card = {
    url,
    status,
    title: decode(title || meta(html, "og:title") || meta(html, "twitter:title")),
    description: decode(description).slice(0, 400),
    ogImage,
    jsonLd,
    text: decode(stripped),
    links,
    thin: false,
  };
  return { ...card, thin: isThin(card) };
}

export function seedPaths(origin: string, links: PageLink[]): string[] {
  const seeds = ["/about", "/pricing", "/product", "/products", "/features", "/faq", "/blog"];
  const fromSeeds = seeds
    .map((path) => sameHostUrl(origin, path))
    .filter((href): href is string => Boolean(href));
  const fromLinks = links.map((link) => link.href);
  return [...new Set([...fromLinks, ...fromSeeds])];
}

export function formatJournal(cards: PageCard[]): string {
  return cards
    .map((card) =>
      [
        `URL: ${card.url}`,
        card.title ? `Title: ${card.title}` : "",
        card.description ? `Description: ${card.description}` : "",
        card.jsonLd ? `Structured data: ${card.jsonLd.slice(0, 800)}` : "",
        card.text ? `Text: ${card.text.slice(0, 900)}` : "",
        card.thin ? "Note: HTML was thin (likely a JS app shell)." : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function formatBrief(value: {
  product?: string;
  audience?: string;
  offer?: string;
  facts?: string[];
  look?: string;
  cta?: string;
  gaps?: string;
}): string {
  const facts = Array.isArray(value.facts) ? value.facts.filter((item) => typeof item === "string" && item.trim()) : [];
  return [
    value.product ? `Product: ${value.product}` : "",
    value.audience ? `Audience: ${value.audience}` : "",
    value.offer ? `Offer: ${value.offer}` : "",
    facts.length ? `Facts:\n${facts.map((item) => `- ${item.trim()}`).join("\n")}` : "",
    value.look ? `Look: ${value.look}` : "",
    value.cta ? `CTA: ${value.cta}` : "",
    value.gaps ? `Unknown: ${value.gaps}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4500);
}

export async function fetchPage(url: string): Promise<PageCard> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Surreel/1.0 (+https://studio.getvideos.app)", accept: "text/html,application/json;q=0.9,*/*;q=0.1" },
      redirect: "follow",
      signal: controller.signal,
    });
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/") && !type.includes("json") && !type.includes("html")) {
      return {
        url: response.url || url,
        status: response.status,
        title: "",
        description: "",
        ogImage: "",
        jsonLd: "",
        text: `Source URL: ${url}`,
        links: [],
        thin: true,
      };
    }
    const html = (await response.text()).slice(0, MAX_BODY);
    return parsePage(response.url || url, html, type, response.status);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchReadable(url: string): Promise<PageCard | undefined> {
  try {
    const card = await fetchPage(`https://r.jina.ai/${url}`);
    if (card.status >= 400 || card.text.length < 120) return undefined;
    return {
      ...card,
      url,
      title: card.title || "Readable extract",
      thin: false,
    };
  } catch {
    return undefined;
  }
}

function meta(html: string, name: string): string {
  const property = name.includes(":") ? "property" : "name";
  const pattern = new RegExp(
    `<meta[^>]+(?:${property}|name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:${property}|name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  return (pattern.exec(html)?.[1] ?? alt.exec(html)?.[1] ?? "").trim();
}

function attr(html: string, pattern: RegExp): string {
  return pattern.exec(html)?.[1] ?? "";
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripHash(url: string): string {
  try {
    const next = new URL(url);
    next.hash = "";
    return next.toString();
  } catch {
    return url;
  }
}
