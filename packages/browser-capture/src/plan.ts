import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ElementHandle, Page } from "puppeteer-core";
import type { CaptureOutput, CaptureSession } from "./index.js";

/**
 * A recorded walkthrough described as data: the page's real controls, the actions a viewer should
 * see and the states that prove each action worked. Replaying a plan removes the pauses of an agent
 * thinking between actions and makes a retake repeatable.
 */
export type CapturePlan = {
  readonly startUrl: string;
  /** Selector that proves the start page is usable; loading stays outside the recording. */
  readonly startUntil?: string;
  /** Extra loads of the start page when `startUntil` does not appear (public sites sometimes answer with an error page). */
  readonly startRetries?: number;
  readonly startTimeoutMs?: number;
  /** The product's own session endpoint; a visible workspace is not proof of login. */
  readonly loginCheck?: string;
  readonly steps: readonly CapturePlanStep[];
};

export type CapturePlanAction =
  | "goto" | "wait" | "assert" | "dismiss" | "hover" | "click" | "dblclick" | "fill" | "type"
  | "press" | "scroll" | "pause" | "screenshot" | "drag" | "upload";

export type CapturePlanStep = {
  readonly action: CapturePlanAction;
  readonly note?: string;
  /** Selector for the element the step acts on (Puppeteer syntax, or `text=` / `role=` shorthands). */
  readonly target?: string;
  /** Selector `wait` waits for. */
  readonly for?: string;
  /** Which visible match to use when a selector legitimately matches several elements. */
  readonly index?: number;
  readonly url?: string;
  readonly value?: string;
  readonly key?: string;
  readonly ms?: number;
  readonly dx?: number;
  readonly dy?: number;
  /** `scroll`: spread the distance over this time so the page glides instead of jumping. */
  readonly durationMs?: number;
  /** `drag`: move next to another element instead of by dx/dy. */
  readonly toward?: string;
  /** `click`: press at a fraction of the target box, e.g. [0.5, 0.9]. */
  readonly at?: readonly [number, number];
  /** `type`: delay between keys. */
  readonly delayMs?: number;
  /** `upload`: local file fed to the page's file chooser. */
  readonly file?: string;
  /** Exact identity the target must carry, e.g. `{ attribute: "data-asset-id", value: "a12" }`. */
  readonly asset?: { readonly attribute: string; readonly value: string };
  /** A missing target is skipped (cookie banners, promotions that may not appear). */
  readonly optional?: boolean;
  /** Required to click a paid or destructive control; only the task owner may grant it. */
  readonly authorized?: boolean;
  readonly timeoutMs?: number;
  /** Time to let the page settle after the step. */
  readonly settleMs?: number;
  readonly screenshot?: boolean;
  readonly name?: string;
};

export type CapturePlanOptions = {
  /** New or empty directory receiving recording.mp4, steps.json and screenshots/. */
  readonly directory: string;
  /**
   * `none` (default) keeps the footage clean so the composition can draw a cursor, zoom or highlight
   * from steps.json; `page` draws a cursor into the recorded page.
   */
  readonly cursor?: "none" | "page";
  readonly fps?: number;
  /** Overrides the plan's `loginCheck`. */
  readonly loginCheck?: string;
  /** Resolves relative `upload` files; defaults to the working directory. */
  readonly baseDirectory?: string;
  log?(message: string): void;
};

export type CapturePlanStepReport = {
  readonly index: number;
  readonly action: CapturePlanAction;
  readonly note: string | null;
  /** Seconds from the first recorded frame. */
  readonly start: number;
  readonly end: number;
  readonly url: string;
  /** Target box after the step in CSS pixels [x, y, width, height]; multiply by `scale` for video pixels. */
  readonly box?: readonly [number, number, number, number];
  /** Where the pointer acted, in CSS pixels. */
  readonly pointer?: readonly [number, number];
  readonly screenshot?: string;
  readonly skipped?: string;
  readonly asset?: { readonly attribute: string; readonly value: string; readonly verified: true };
};

export type CapturePlanReport = {
  readonly format: "hypit.capture-plan@1";
  readonly startUrl: string;
  readonly startLoads: number;
  readonly viewport: { readonly width: number; readonly height: number; readonly scale: number };
  readonly cursor: "none" | "page";
  readonly auth: { readonly checked: string; readonly loggedIn: boolean; readonly account: string | null } | null;
  readonly failed: string | null;
  readonly recording: CaptureOutput | null;
  readonly steps: readonly CapturePlanStepReport[];
};

const ACTIONS = new Set<string>(["goto", "wait", "assert", "dismiss", "hover", "click", "dblclick", "fill", "type",
  "press", "scroll", "pause", "screenshot", "drag", "upload"]);
const NEEDS_TARGET = new Set<string>(["assert", "hover", "click", "dblclick", "fill", "type", "drag"]);
/** Clicking these spends money or destroys data; a recording only hovers them unless authorized. */
const GUARDED = /\b(generate|purchase|buy|checkout|subscribe|delete|remove|send|pay|upscale|reshoot|animate|publish|submit)\b/iu;

/** Validate a plan before opening a browser, so a typo fails without a half-made recording. */
export function parseCapturePlan(value: unknown): CapturePlan {
  const plan = value as CapturePlan;
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) throw new Error("A capture plan must be a JSON object");
  if (typeof plan.startUrl !== "string" || plan.startUrl === "") throw new Error("A capture plan needs startUrl");
  if (!Array.isArray(plan.steps)) throw new Error("A capture plan needs a steps array");
  plan.steps.forEach((step, index) => {
    const at = `steps[${index}]`;
    if (step === null || typeof step !== "object") throw new Error(`${at} must be an object`);
    if (!ACTIONS.has(step.action)) throw new Error(`${at}: unknown action ${String(step.action)}`);
    if (NEEDS_TARGET.has(step.action) && typeof step.target !== "string") throw new Error(`${at}: ${step.action} needs target`);
    if (step.action === "wait" && typeof step.for !== "string") throw new Error(`${at}: wait needs for`);
    if (step.action === "goto" && typeof step.url !== "string") throw new Error(`${at}: goto needs url`);
    if (step.action === "press" && typeof step.key !== "string") throw new Error(`${at}: press needs key`);
    if (step.action === "upload" && typeof step.file !== "string") throw new Error(`${at}: upload needs file`);
    if ((step.action === "fill" || step.action === "type") && typeof step.value !== "string") throw new Error(`${at}: ${step.action} needs value`);
    if (step.action === "drag" && step.toward === undefined && step.dx === undefined && step.dy === undefined) {
      throw new Error(`${at}: drag needs toward or dx/dy`);
    }
    if (step.asset !== undefined && (typeof step.asset?.attribute !== "string" || typeof step.asset?.value !== "string")) {
      throw new Error(`${at}: asset needs attribute and value strings`);
    }
  });
  return plan;
}

/**
 * Translate the `text=` and `role=` shorthands used by Playwright-style plans; anything else is
 * already a Puppeteer selector (CSS, `::-p-text(...)`, `::-p-aria(...)`).
 */
export function planSelector(selector: string): string {
  const text = /^text=(.+)$/su.exec(selector);
  if (text) return `::-p-text(${text[1]!.replace(/^(["'])(.*)\1$/su, "$2")})`;
  const role = /^role=([a-z]+)(?:\[name=(["'])(.*)\2\])?$/su.exec(selector);
  if (role) {
    const name = role[3] === undefined ? "" : `[name=${JSON.stringify(role[3])}]`;
    return `::-p-aria(${name}[role=${JSON.stringify(role[1])}])`;
  }
  return selector;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Exactly one visible element (or the chosen `index`); several are an error rather than a guess. */
async function findTarget(page: Page, step: CapturePlanStep, selector: string, timeout: number): Promise<ElementHandle<Element>> {
  const query = planSelector(selector);
  await page.waitForSelector(query, { visible: true, timeout });
  const visible: ElementHandle<Element>[] = [];
  for (const element of await page.$$(query)) {
    if (await element.isVisible()) visible.push(element); else await element.dispose();
  }
  const chosen = step.index === undefined ? (visible.length === 1 ? visible[0] : undefined) : visible[step.index];
  for (const element of visible) if (element !== chosen) await element.dispose();
  if (chosen === undefined) {
    throw new Error(step.index === undefined
      ? `AMBIGUOUS_TARGET: ${selector} matched ${visible.length} visible elements; narrow it or choose index`
      : `${selector} has no visible match at index ${step.index}`);
  }
  if (step.asset !== undefined && await chosen.evaluate((el, name) => (el as Element).getAttribute(name), step.asset.attribute) !== step.asset.value) {
    throw new Error(`ASSET_IDENTITY_MISMATCH: ${selector} does not carry ${step.asset.attribute}="${step.asset.value}"`);
  }
  return chosen;
}

async function boxOf(element: ElementHandle<Element>): Promise<[number, number, number, number] | undefined> {
  const box = await element.boundingBox().catch(() => null);
  return box ? [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)] : undefined;
}

/**
 * Page-drawn cursor, used only with `cursor: "page"`. Moved by the replay before each pointer action.
 * Kept as source text: a transpiled function can carry helpers that do not exist inside the page.
 */
const CURSOR_SCRIPT = `(() => {
  const make = () => {
    if (document.getElementById("__hypit_cursor") || !document.body) return;
    const cursor = document.createElement("div");
    cursor.id = "__hypit_cursor";
    cursor.style.cssText = "position:fixed;z-index:2147483647;width:22px;height:30px;pointer-events:none;left:-100px;top:-100px;"
      + "transition:left .35s ease,top .35s ease,transform .14s;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))";
    cursor.innerHTML = '<svg viewBox="0 0 22 30" width="22" height="30"><path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L20 17 Z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>';
    document.body.appendChild(cursor);
  };
  make();
  document.addEventListener("DOMContentLoaded", make);
  window.__hypitCursor = (x, y, press) => {
    make();
    const cursor = document.getElementById("__hypit_cursor");
    if (!cursor) return;
    cursor.style.left = (x - 2) + "px"; cursor.style.top = (y - 2) + "px";
    if (press) { cursor.style.transform = "scale(.8)"; setTimeout(() => { cursor.style.transform = ""; }, 140); }
  };
})()`;

async function dismissDialogs(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const closed = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[aria-modal="true"]'))
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed");
      const dialog = dialogs.at(-1);
      if (!dialog) return "none";
      const close = dialog.querySelector<HTMLElement>('button[aria-label*="close" i],button[aria-label*="dismiss" i],[data-dismiss],button:has(svg)');
      if (close) { close.click(); return "clicked"; }
      return "escape";
    });
    if (closed === "none") break;
    if (closed === "escape") await page.keyboard.press("Escape");
    await sleep(500);
  }
  // Overlays that are not dialogs (promotion toasts, cookie notes) often expose only a labelled close button.
  await page.evaluate(() => {
    for (const button of Array.from(document.querySelectorAll<HTMLElement>('button[aria-label*="close" i],button[aria-label*="dismiss" i]'))) {
      if (button.offsetParent !== null) button.click();
    }
  });
}

/**
 * Replay a plan in the session's page while recording it. Stops at the first failed step, keeps the
 * recording made so far, and writes steps.json either way; the returned report says whether it passed.
 */
export async function runCapturePlan(session: CaptureSession, input: CapturePlan, options: CapturePlanOptions): Promise<CapturePlanReport> {
  const plan = parseCapturePlan(input);
  const { page } = session;
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).length > 0) throw new Error(`Plan output ${directory} must be new or empty; keep earlier takes`);
  const cursor = options.cursor ?? "none";
  const log = options.log ?? (() => {});
  const viewportSize = page.viewport() ?? { width: 1280, height: 720, deviceScaleFactor: 1 };
  const viewport = { width: viewportSize.width, height: viewportSize.height, scale: viewportSize.deviceScaleFactor ?? 1 };
  if (cursor === "page") await page.evaluateOnNewDocument(CURSOR_SCRIPT);

  let startLoads = 1;
  for (let load = 1; ; load++) {
    await page.goto(plan.startUrl, { waitUntil: "domcontentloaded" });
    if (plan.startUntil === undefined) { await sleep(1200); break; }
    try {
      await page.waitForSelector(planSelector(plan.startUntil), { visible: true, timeout: plan.startTimeoutMs ?? 15_000 });
      startLoads = load;
      break;
    } catch (error) {
      if (load > (plan.startRetries ?? 0)) throw new Error(`Start page never showed ${plan.startUntil} after ${load} load(s): ${page.url()}`, { cause: error });
      await sleep(2500);
    }
  }

  let auth: CapturePlanReport["auth"] = null;
  const loginCheck = options.loginCheck ?? plan.loginCheck;
  const report = (failed: string | null, recording: CaptureOutput | null, steps: CapturePlanStepReport[]): CapturePlanReport =>
    ({ format: "hypit.capture-plan@1", startUrl: plan.startUrl, startLoads, viewport, cursor, auth, failed, recording, steps });
  const save = async (value: CapturePlanReport) => {
    await writeFile(join(directory, "steps.json"), `${JSON.stringify(value, null, 2)}\n`);
    return value;
  };
  if (loginCheck !== undefined) {
    // Only an account label leaves the page; tokens and cookies are never read here.
    const user = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) return null;
        const body = await response.json() as Record<string, any>;
        const found = body?.user ?? body?.data?.user ?? body?.session?.user ?? null;
        return found ? String(found.name ?? found.email ?? found.id ?? "user") : null;
      } catch { return null; }
    }, loginCheck);
    auth = { checked: loginCheck, loggedIn: user !== null, account: user };
    if (user === null) return await save(report("login check failed: no user session", null, []));
    log(`Logged in as ${user}`);
  }

  const recording = await session.record({ path: join(directory, "recording.mp4"), ...(options.fps === undefined ? {} : { fps: options.fps }) });
  // The native recorder's first frame follows the start call; step times are measured from here.
  const t0 = performance.now();
  const stamp = () => Number(((performance.now() - t0) / 1000).toFixed(3));
  const pointerTo = async (x: number, y: number, press: boolean) => {
    await page.mouse.move(x, y, { steps: 12 });
    if (cursor === "page") await page.evaluate((x, y, press) => (window as any).__hypitCursor?.(x, y, press), x, y, press);
    await sleep(cursor === "page" ? 400 : 150);
  };
  const center = async (element: ElementHandle<Element>, at?: readonly [number, number]): Promise<[number, number]> => {
    await element.scrollIntoView();
    const box = await element.boundingBox();
    if (box === null) throw new Error("Target has no box on screen");
    return [Math.round(box.x + box.width * (at?.[0] ?? 0.5)), Math.round(box.y + box.height * (at?.[1] ?? 0.5))];
  };
  const shot = async (index: number, name?: string) => {
    const file = `${String(index).padStart(2, "0")}${name ? `-${name.replace(/[^\w.-]+/gu, "-")}` : ""}.png`;
    // The composition owns any cursor drawn over evidence frames.
    if (cursor === "page") await page.evaluate(() => { const c = document.getElementById("__hypit_cursor"); if (c) c.style.visibility = "hidden"; });
    await session.screenshot({ path: join(directory, "screenshots", file) });
    if (cursor === "page") await page.evaluate(() => { const c = document.getElementById("__hypit_cursor"); if (c) c.style.visibility = ""; });
    return file;
  };

  const steps: CapturePlanStepReport[] = [];
  let failed: string | null = null;
  try {
    for (const [index, step] of plan.steps.entries()) {
      const start = stamp();
      const url = page.url();
      const timeout = step.timeoutMs ?? 10_000;
      let element: ElementHandle<Element> | undefined;
      let pointer: [number, number] | undefined;
      let skipped: string | undefined;
      log(`${index}: ${step.action}${step.note ? ` — ${step.note}` : ""}`);
      try {
        if (step.target !== undefined) element = await findTarget(page, step, step.target, timeout);
        switch (step.action) {
          case "goto": await page.goto(step.url!, { waitUntil: "domcontentloaded" }); break;
          case "wait": await page.waitForSelector(planSelector(step.for!), { visible: true, timeout }); break;
          case "assert": break;
          case "pause": await sleep(step.ms ?? 1000); break;
          case "screenshot": break;
          case "dismiss": await dismissDialogs(page); break;
          case "press": if (element) await element.focus(); await page.keyboard.press(step.key as Parameters<Page["keyboard"]["press"]>[0]); break;
          case "hover": pointer = await center(element!); await pointerTo(...pointer, false); break;
          case "click":
          case "dblclick": {
            const label = `${step.target} ${await element!.evaluate((el) => `${(el as HTMLElement).innerText ?? ""} ${el.getAttribute("aria-label") ?? ""} ${(el as HTMLInputElement).value ?? ""}`.slice(0, 200))}`;
            if (GUARDED.test(label) && step.authorized !== true) {
              throw new Error(`GUARDED_ACTION: clicking ${step.target} may spend money or change data; hover it, or add "authorized": true when the task owner allows it`);
            }
            pointer = await center(element!, step.at);
            await pointerTo(...pointer, true);
            await page.mouse.click(...pointer, { count: step.action === "dblclick" ? 2 : 1 });
            break;
          }
          case "fill":
          case "type":
            pointer = await center(element!);
            await pointerTo(...pointer, true);
            await page.mouse.click(...pointer);
            if (step.action === "fill") {
              // Replace existing text the way a person would, then enter the new value at once.
              const hadText = await element!.evaluate((el) => {
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { el.select(); return el.value !== ""; }
                const range = document.createRange(); range.selectNodeContents(el);
                const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
                return (el.textContent ?? "") !== "";
              });
              if (hadText) await page.keyboard.press("Backspace");
              await page.keyboard.sendCharacter(step.value!);
            } else {
              await page.keyboard.type(step.value!, { delay: step.delayMs ?? 40 });
            }
            break;
          case "scroll": {
            const [x, y] = element ? await center(element) : [viewport.width / 2, viewport.height / 2];
            await page.mouse.move(x, y);
            const dx = step.dx ?? 0, dy = step.dy ?? 400;
            // Distance follows elapsed time, so the glide lasts durationMs however long each wheel event takes.
            const duration = step.durationMs ?? 0, begin = performance.now();
            let sent = 0;
            for (;;) {
              const progress = duration > 0 ? Math.min(1, (performance.now() - begin) / duration) : 1;
              const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
              await page.mouse.wheel({ deltaX: dx * (eased - sent), deltaY: dy * (eased - sent) });
              sent = eased;
              if (progress >= 1) break;
              await sleep(16);
            }
            break;
          }
          case "drag": {
            const from = await center(element!);
            let to: [number, number] = [from[0] + (step.dx ?? 0), from[1] + (step.dy ?? 0)];
            if (step.toward !== undefined) {
              const anchor = await findTarget(page, { action: "assert" }, step.toward, timeout);
              const box = await anchor.boundingBox();
              await anchor.dispose();
              if (box === null) throw new Error(`drag anchor ${step.toward} has no box`);
              to = [box.x + box.width / 2 + (step.dx ?? 0), box.y + box.height / 2 + (step.dy ?? 0)];
            }
            to = [Math.min(Math.max(to[0], 4), viewport.width - 4), Math.min(Math.max(to[1], 4), viewport.height - 4)];
            await pointerTo(...from, true);
            await page.mouse.down();
            await page.mouse.move(...to, { steps: 24 });
            if (cursor === "page") await page.evaluate((x, y) => (window as any).__hypitCursor?.(x, y, false), ...to);
            await page.mouse.up();
            pointer = [Math.round(to[0]), Math.round(to[1])];
            break;
          }
          case "upload": {
            const file = resolve(options.baseDirectory ?? process.cwd(), step.file!);
            if (element) {
              const [chooser] = await Promise.all([page.waitForFileChooser({ timeout }), (async () => {
                pointer = await center(element!); await pointerTo(...pointer, true); await page.mouse.click(...pointer);
              })()]);
              await chooser.accept([file]);
            } else {
              const fileInput = await page.waitForSelector("input[type=file]", { timeout });
              await (fileInput as ElementHandle<HTMLInputElement>).uploadFile(file);
              await fileInput!.dispose();
            }
            break;
          }
        }
      } catch (error) {
        if (!(step.optional === true && step.asset === undefined && error instanceof Error && error.name === "TimeoutError")) throw error;
        skipped = error.message.split("\n")[0]!.slice(0, 160);
      }
      const box = element && !skipped ? await boxOf(element) : undefined;
      await element?.dispose();
      const screenshot = step.action === "screenshot" || step.screenshot ? await shot(index, step.name) : undefined;
      steps.push({ index, action: step.action, note: step.note ?? null, start, end: stamp(), url,
        ...(box ? { box } : {}), ...(pointer ? { pointer } : {}), ...(screenshot ? { screenshot } : {}),
        ...(skipped ? { skipped } : {}),
        ...(step.asset && !skipped ? { asset: { ...step.asset, verified: true as const } } : {}) });
      await sleep(step.settleMs ?? 600);
    }
    await sleep(1200);
  } catch (error) {
    failed = `steps[${steps.length}]: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
    await session.screenshot({ path: join(directory, "screenshots", "failed.png") }).catch(() => undefined);
  }
  const video = await recording.stop();
  return await save(report(failed, video, steps));
}
