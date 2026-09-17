import { formatBrief } from "./page.ts";

export const BROWSER_USE_API = "https://api.browser-use.com/api/v2";

export type BrowserTaskStatus = "created" | "started" | "finished" | "failed" | "stopped";

export type BrowserTask = {
  id: string;
  status: BrowserTaskStatus;
  output?: string | null;
  steps?: Array<{ url?: string; nextGoal?: string }>;
};

export type PageBrowse = {
  url: string;
  taskId?: string;
  brief?: string;
  summary?: string;
  hops?: string[];
};

export const PAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    product: { type: "string" },
    audience: { type: "string" },
    offer: { type: "string" },
    facts: { type: "array", items: { type: "string" } },
    look: { type: "string" },
    cta: { type: "string" },
    gaps: { type: "string" },
    pages: { type: "array", items: { type: "string" } },
  },
};

export function pageKey(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

export function allowedDomains(url: string): string[] {
  const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  return [host, `www.${host}`];
}

export function exploreTask(url: string): string {
  return [
    `Open ${url} in the browser.`,
    "This is a public product or marketing page for a short video brief.",
    "Do not log in, do not create an account, do not checkout, and do not type secrets.",
    "Stay on this host. Follow same-site links that explain the product, offer, audience, or look (about, pricing, features, product, FAQ).",
    "Read what is on screen after JavaScript renders. Invent no claims, prices, or features.",
    "If a fact is not visible, put it in gaps.",
    "Return the structured brief from pages you actually opened.",
  ].join(" ");
}

export function briefFromBrowser(task: BrowserTask, url: string): { brief: string; hops: string[]; summary: string } {
  const hops = [
    ...new Set((task.steps ?? []).map((step) => step.url).filter((item): item is string => Boolean(item))),
  ];
  const parsed = parseOutput(task.output);
  const facts = Array.isArray(parsed.facts) ? parsed.facts.filter((item): item is string => typeof item === "string") : [];
  const pages = Array.isArray(parsed.pages) ? parsed.pages.filter((item): item is string => typeof item === "string") : hops;
  const brief = formatBrief({
    product: asString(parsed.product),
    audience: asString(parsed.audience),
    offer: asString(parsed.offer),
    facts,
    look: asString(parsed.look),
    cta: asString(parsed.cta),
    gaps: asString(parsed.gaps),
  });
  const product = asString(parsed.product) || new URL(url).hostname;
  const opened = pages.length > 0 ? pages : hops.length > 0 ? hops : [url];
  return {
    brief: [brief, "", "# Pages opened", opened.map((item) => `URL: ${item}`).join("\n")].join("\n").slice(0, 1800),
    hops: opened,
    summary: `Browser Use explored ${opened.length} page${opened.length === 1 ? "" : "s"} on ${new URL(url).hostname}. ${product}`,
  };
}

export function isBrowserTerminal(status: string): boolean {
  return status === "finished" || status === "failed" || status === "stopped";
}

export async function createBrowserTask(key: string, url: string): Promise<string> {
  const body = await browserFetch<{ id?: string }>(key, "/tasks", {
    method: "POST",
    payload: {
      task: exploreTask(url),
      startUrl: url,
      llm: "browser-use-2.0",
      maxSteps: 8,
      structuredOutput: JSON.stringify(PAGE_SCHEMA),
      allowedDomains: allowedDomains(url),
    },
  });
  if (typeof body.id !== "string" || !body.id) throw new Error("Browser Use did not start a task.");
  return body.id;
}

export async function getBrowserTask(key: string, id: string): Promise<BrowserTask> {
  const body = await browserFetch<BrowserTask>(key, `/tasks/${encodeURIComponent(id)}`);
  return {
    id: body.id,
    status: body.status,
    output: body.output,
    steps: body.steps,
  };
}

export async function stopBrowserTask(key: string, id: string): Promise<void> {
  try {
    await browserFetch(key, `/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      payload: { action: "stop_task_and_session" },
    });
  } catch {
    // Stopping is best-effort; a finished task is already done.
  }
}

async function browserFetch<T>(
  key: string,
  path: string,
  init: { method?: string; payload?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BROWSER_USE_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "X-Browser-Use-API-Key": key,
      Accept: "application/json",
      ...(init.payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.payload === undefined ? undefined : JSON.stringify(init.payload),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not json
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && typeof (body as { detail?: unknown }).detail === "string"
        ? (body as { detail: string }).detail
        : `Browser Use ${response.status}`;
    throw new Error(detail);
  }
  return body as T;
}

function parseOutput(output: string | null | undefined): Record<string, unknown> {
  if (!output || !output.trim()) return {};
  try {
    const parsed = JSON.parse(output);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { offer: output };
  } catch {
    const match = output.match(/\{[\s\S]*\}/);
    if (!match) return { look: output.slice(0, 1200) };
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { look: output.slice(0, 1200) };
    } catch {
      return { look: output.slice(0, 1200) };
    }
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
