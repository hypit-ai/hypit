import { completeJson } from "./openrouter.ts";
import {
  fetchPage,
  fetchReadable,
  formatBrief,
  formatJournal,
  sameHostUrl,
  seedPaths,
  type PageCard,
} from "./page.ts";

export type PageExplore = {
  brief: string;
  hops: string[];
  summary: string;
};

const MAX_HOPS = 4;

export async function explorePage(key: string, url: string): Promise<PageExplore> {
  const start = await fetchPage(url);
  if (start.status >= 400 && start.text.length < 40) {
    throw new Error(`Could not fetch the page (${start.status}).`);
  }
  const cards: PageCard[] = [start];
  if (start.thin) {
    const readable = await fetchReadable(start.url);
    if (readable) cards.push(readable);
  }
  const visited = new Set(cards.map((card) => card.url));
  const candidates = unique(
    seedPaths(start.url, start.links).filter((href) => !visited.has(href) && sameHostUrl(start.url, href)),
  );
  const next = await decideNext(key, start, candidates, cards);
  for (const href of next) {
    if (cards.length >= MAX_HOPS) break;
    if (visited.has(href)) continue;
    try {
      const card = await fetchPage(href);
      cards.push(card);
      visited.add(card.url);
    } catch {
      // Keep going; one dead link does not stop the brief.
    }
  }
  const hops = cards.map((card) => card.url);
  try {
    const understanding = await understand(key, url, cards);
    const product = understanding.product?.trim() || start.title || new URL(url).hostname;
    return {
      brief: [understanding.text, "", "# Pages opened", hops.map((item) => `URL: ${item}`).join("\n")].join("\n").slice(0, 1800),
      hops,
      summary: `Explored ${hops.length} URL${hops.length === 1 ? "" : "s"} on ${new URL(url).hostname}. ${product}`,
    };
  } catch {
    return {
      brief: formatJournal(cards).slice(0, 1800),
      hops,
      summary: `Explored ${hops.length} URL${hops.length === 1 ? "" : "s"} on ${new URL(url).hostname}.`,
    };
  }
}

async function decideNext(key: string, start: PageCard, candidates: string[], cards: PageCard[]): Promise<string[]> {
  if (candidates.length === 0) return [];
  try {
    const parsed = await completeJson(
      key,
      [
        {
          role: "system",
          content:
            "You explore a public product page for a video brief. Pick up to 3 more same-host URLs that would add product facts, offer, audience, or look. Invent no URLs. Return JSON {\"next\":[\"https://...\"]}. Empty next is allowed.",
        },
        {
          role: "user",
          content: [
            `Start: ${start.url}`,
            start.thin ? "The first HTML was a thin JS shell." : "",
            `Already opened: ${cards.map((card) => card.url).join(", ")}`,
            `Candidates:\n${candidates.slice(0, 24).join("\n")}`,
            start.title ? `Title: ${start.title}` : "",
            start.description ? `Description: ${start.description}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      { maxTokens: 400 },
    );
    const next = (parsed && typeof parsed === "object" ? (parsed as { next?: unknown }).next : undefined) ?? [];
    if (!Array.isArray(next)) return candidates.slice(0, start.thin ? 3 : 1);
    return unique(
      next
        .filter((item): item is string => typeof item === "string")
        .map((item) => sameHostUrl(start.url, item))
        .filter((item): item is string => Boolean(item))
        .filter((item) => candidates.includes(item) || start.links.some((link) => link.href === item)),
    ).slice(0, 3);
  } catch {
    return candidates.slice(0, start.thin ? 3 : 2);
  }
}

async function understand(
  key: string,
  url: string,
  cards: PageCard[],
): Promise<{ text: string; product?: string }> {
  const parsed = await completeJson(
    key,
    [
      {
        role: "system",
        content:
          'You write a page brief for video production. Use only the fetched pages. Invent no claims, prices, or features. If a fact is missing, put it in gaps. Return JSON {"product":"","audience":"","offer":"","facts":[""],"look":"","cta":"","gaps":""}.',
      },
      {
        role: "user",
        content: [`Source URL: ${url}`, "", formatJournal(cards)].join("\n"),
      },
    ],
    { maxTokens: 900 },
  );
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const facts = Array.isArray(record.facts) ? record.facts.filter((item): item is string => typeof item === "string") : [];
  return {
    product: typeof record.product === "string" ? record.product : undefined,
    text: formatBrief({
      product: typeof record.product === "string" ? record.product : undefined,
      audience: typeof record.audience === "string" ? record.audience : undefined,
      offer: typeof record.offer === "string" ? record.offer : undefined,
      facts,
      look: typeof record.look === "string" ? record.look : undefined,
      cta: typeof record.cta === "string" ? record.cta : undefined,
      gaps: typeof record.gaps === "string" ? record.gaps : undefined,
    }),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
