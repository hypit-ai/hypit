import type { PictureInterpretation } from "@hypit/media";
import type { HtmlProcessUsage } from "@hypit/html-program";

/** The optional completion hooks supplied by the pinned HTML page runtime. */
type RenderWindow = Window & {
  __hypitFrameProgram: {
    prepare(spans?: readonly { readonly startFrame: number; readonly endFrameExclusive: number }[]): Promise<void>;
    applyFrame(frame: number): Promise<void>;
  };
  __hypitHtmlVisualError?: string;
  __hypitCaptureRoots?: readonly Element[];
  __hypitPrepareImages(): Promise<void>;
  __hypitDrawVideoSources?(sources: readonly SourceFrameUpdate[]): Promise<void>;
};

export type SourceFrameUpdate = {
  readonly id: string;
  readonly elementId: string;
  readonly url: string;
  /** Author-resolved interpretation; decoder/container tags are not authority. */
  readonly picture?: PictureInterpretation;
  readonly sample?:
    | {
        readonly kind: "frame";
        readonly frame: number;
        readonly fps: { readonly num: number; readonly den: number };
        readonly streamIndex: number;
        readonly reverse: boolean;
      }
    | {
        readonly kind: "time";
        /** Finite decoder seek hint only; timestampTicks/timeBase prove the selected sample. */
        readonly timestamp: number;
        readonly timestampTicks: string;
        readonly timeBase: { readonly numerator: string; readonly denominator: string };
        readonly streamIndex: number;
        readonly codedWidth: number;
        readonly codedHeight: number;
        readonly sampleAspectRatio: { readonly numerator: number; readonly denominator: number };
        readonly rotation: 0 | 90 | 180 | 270;
      };
};

export type FramePreparationTiming = {
  /** Main-process wall time for the complete page evaluation. */
  readonly evaluationMs: number;
  /** Author Program state change inside the page. */
  readonly programMs: number;
  /** Selected source decoding and drawing inside the page. */
  readonly sourceMs: number;
  /** Image and font readiness after the new state is visible. */
  readonly readinessMs: number;
};

export type FramePreparationPage = {
  readonly evaluate: <Parameters extends unknown[], Result>(
    operation: (...parameters: Parameters) => Result | Promise<Result>,
    ...parameters: Parameters
  ) => Promise<Awaited<Result>>;
  readonly screenshot?: (options: {
    readonly type: "png";
    readonly omitBackground: boolean;
    readonly optimizeForSpeed: boolean;
    readonly captureBeyondViewport: boolean;
    readonly clip: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  }) => Promise<Uint8Array>;
};

/** Install page-owned readiness and prepare one deterministic frame state. */
export async function createFramePreparer(page: FramePreparationPage, processUsages: readonly HtmlProcessUsage[] = []) {
  // Image readiness belongs to this page. A seek can select a new image through
  // attributes, a CSS class or a pseudo-element after initial page readiness.
  await page.evaluate(() => {
    const decoded = new Map<string, Promise<void>>();
    const dirtyRoots = new Set<Element>();
    const animatedRoots = new Set<Element>();
    const inspectedAnimations = new WeakSet<Animation>();
    const pendingSheetChanges = new Set<Promise<unknown>>();
    const announcedRoots = (window as unknown as RenderWindow).__hypitCaptureRoots;
    const captureRoots = Array.isArray(announcedRoots)
      && announcedRoots.every(root => root instanceof Element) ? [...announcedRoots] : null;
    const images = {
      load(url: string): Promise<void> {
        const target = new URL(url, document.baseURI);
        const owner = new URL(document.baseURI);
        if (target.hash.length > 0 && target.origin === owner.origin
          && target.pathname === owner.pathname && target.search === owner.search) {
          // SVG masks, filters, gradients and clips are document-local resources,
          // not independently decodable image files.
          return Promise.resolve();
        }
        const absolute = target.href;
        let ready = decoded.get(absolute);
        if (ready === undefined) {
          const image = new Image();
          image.src = absolute;
          ready = image.decode().catch(error => {
            throw new Error(`HTML renderer image could not be decoded: ${absolute}`, { cause: error });
          });
          decoded.set(absolute, ready);
        }
        return ready;
      },
      background(value: string, pending: Promise<unknown>[]) {
        for (const match of value.matchAll(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s"'()]+))\s*\)/gu)) {
          const url = (match[1] ?? match[2] ?? match[3] ?? "").trim();
          if (url) pending.push(this.load(url));
        }
      },
      style(style: CSSStyleDeclaration, pending: Promise<unknown>[]) {
        for (const value of [style.backgroundImage, style.maskImage, style.borderImageSource, style.listStyleImage, style.content]) {
          this.background(value, pending);
        }
      },
      inlineSignature(value: string): string {
        const style = document.createElement("span").style;
        style.cssText = value;
        const candidates = [style.backgroundImage, style.maskImage, style.borderImageSource, style.listStyleImage, style.content];
        for (let index = 0; index < style.length; index += 1) {
          const name = style.item(index);
          if (name.startsWith("--")) candidates.push(style.getPropertyValue(name));
        }
        return candidates.filter(candidate => /url\(|image-set\(|cross-fade\(|var\(/iu.test(candidate)).join("\n");
      },
    };
    const readiness = {
      markDirty(node: Node | null): void {
        if (node === document) {
          // A real global stylesheet edit has opaque whole-document reach.
          // This is the explicit escape hatch, not the initial scoped path.
          if (document.documentElement !== null) dirtyRoots.add(document.documentElement);
          return;
        }
        if (!(node instanceof Element)) return;
        if (captureRoots === null) {
          dirtyRoots.add(node);
          return;
        }
        for (const root of captureRoots) {
          if (root === node || root.contains(node)) {
            dirtyRoots.add(node);
            return;
          }
          if (node.contains(root)) dirtyRoots.add(root);
        }
      },
      markAnimatedImageRoots(): void {
        for (const animation of document.getAnimations()) {
          if (inspectedAnimations.has(animation)) continue;
          inspectedAnimations.add(animation);
          const effect = animation.effect;
          if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof Element)) continue;
          const changesImage = effect.getKeyframes().some(keyframe => Object.entries(keyframe).some(([name, value]) =>
            name !== "easing" && typeof value === "string" && /url\(|image-set\(|cross-fade\(|var\(/iu.test(value)));
          if (changesImage) animatedRoots.add(effect.target);
        }
        // Browser animation state can change without a DOM mutation. Only those
        // targets whose keyframes can select an image remain frame-active.
        for (const root of animatedRoots) {
          if (root.isConnected) this.markDirty(root);
          else animatedRoots.delete(root);
        }
      },
      rootsForPass(): Element[] {
        const roots = [...dirtyRoots].filter(root => root.isConnected);
        dirtyRoots.clear();
        // Do not scan a nested dirty subtree when an ancestor is already dirty.
        return roots.filter(root => !roots.some(other => other !== root && other.contains(root)));
      },
      appendElementImages(element: Element, pending: Promise<unknown>[]): void {
        if (element instanceof HTMLImageElement
          && (element.currentSrc || element.getAttribute("src") || element.getAttribute("srcset"))
          && (!element.complete || element.naturalWidth === 0)) {
          pending.push(element.decode().catch(error => {
            throw new Error(`HTML renderer image could not be decoded: ${element.currentSrc || element.src}`, { cause: error });
          }));
        }
        images.style(getComputedStyle(element), pending);
        for (const pseudo of ["::before", "::after"]) {
          const style = getComputedStyle(element, pseudo);
          if (style.content !== "none" && style.content !== "normal") images.style(style, pending);
        }
        if (element instanceof SVGImageElement) {
          const href = element.getAttribute("href") ?? element.getAttributeNS("http://www.w3.org/1999/xlink", "href");
          if (href) pending.push(images.load(href));
        }
      },
      async preparePass(): Promise<void> {
        if (pendingSheetChanges.size > 0) await Promise.all([...pendingSheetChanges]);
        this.markAnimatedImageRoots();
        const pending: Promise<unknown>[] = [];
        for (const root of this.rootsForPass()) {
          this.appendElementImages(root, pending);
          for (const element of Array.from(root.querySelectorAll("*"))) this.appendElementImages(element, pending);
        }
        await Promise.all(pending);
      },
    };
    // CSSOM edits have no DOM mutation record and can change image selection
    // anywhere in the document. Keep this as the explicit opaque-page fallback:
    // only an actual global stylesheet edit dirties the complete page.
    const sheetPrototype = CSSStyleSheet.prototype;
    const originalInsertRule = sheetPrototype.insertRule;
    const originalDeleteRule = sheetPrototype.deleteRule;
    const originalReplace = sheetPrototype.replace;
    const originalReplaceSync = sheetPrototype.replaceSync;
    const sheetEdits = {
      insertRule(this: CSSStyleSheet, rule: string, index?: number): number {
        const result = Reflect.apply(originalInsertRule, this, index === undefined ? [rule] : [rule, index]) as number;
        readiness.markDirty(document);
        return result;
      },
      deleteRule(this: CSSStyleSheet, index: number): void {
        Reflect.apply(originalDeleteRule, this, [index]);
        readiness.markDirty(document);
      },
      replace(this: CSSStyleSheet, text: string): Promise<CSSStyleSheet> {
        const result = Reflect.apply(originalReplace, this, [text]) as Promise<CSSStyleSheet>;
        const pending = result.then(sheet => {
          readiness.markDirty(document);
          return sheet;
        });
        pendingSheetChanges.add(pending);
        void pending.then(() => pendingSheetChanges.delete(pending), () => pendingSheetChanges.delete(pending));
        return result;
      },
      replaceSync(this: CSSStyleSheet, text: string): void {
        Reflect.apply(originalReplaceSync, this, [text]);
        readiness.markDirty(document);
      },
    };
    sheetPrototype.insertRule = sheetEdits.insertRule;
    sheetPrototype.deleteRule = sheetEdits.deleteRule;
    sheetPrototype.replace = sheetEdits.replace;
    sheetPrototype.replaceSync = sheetEdits.replaceSync;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "childList") {
          // New subtrees can own resources. The parent itself can gain a
          // :empty/:has-driven pseudo image, but unchanged siblings do not need
          // to be rediscovered for the ordinary insertion case.
          const added = Array.from(record.addedNodes);
          const changesStylesheet = (record.target instanceof Element
            && (record.target.tagName === "STYLE" || record.target.tagName === "LINK"))
            || added.some(node => node instanceof Element && (node.tagName === "STYLE" || node.tagName === "LINK"));
          readiness.markDirty(changesStylesheet ? document : record.target);
          for (const node of added) readiness.markDirty(node);
          continue;
        }
        if (record.type === "characterData") {
          const parent = record.target.parentElement;
          // A changed <style> can affect any existing element.
          readiness.markDirty(parent?.tagName === "STYLE" ? document : parent);
          continue;
        }
        const target = record.target;
        if (!(target instanceof Element)) continue;
        const name = record.attributeName ?? "";
        if (target.tagName === "STYLE" || target.tagName === "LINK") {
          readiness.markDirty(document);
        } else if (name === "style") {
          // Layout/visibility writes are common during every seek and cannot
          // introduce a resource. Resource-bearing declarations and custom
          // properties may affect this complete subtree.
          if (images.inlineSignature(record.oldValue ?? "") !== images.inlineSignature(target.getAttribute("style") ?? "")) {
            readiness.markDirty(target);
          }
        } else {
          // class/id/arbitrary data attributes can select descendant and pseudo
          // styles; src/srcset/href also arrive here.
          readiness.markDirty(target);
        }
      }
    });
    if (document.documentElement !== null) {
      if (captureRoots === null) dirtyRoots.add(document.documentElement);
      else for (const root of captureRoots) if (root.isConnected) dirtyRoots.add(root);
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeOldValue: true,
      });
    }
    (window as unknown as { __hypitPrepareImages: () => Promise<void> }).__hypitPrepareImages = async () => {
      // MutationObserver delivery and Promise continuations are microtasks. A
      // pass may itself allow a waiting program to publish another subtree, so
      // drain until the page has no newly dirtied resource scope.
      await Promise.resolve();
      do await readiness.preparePass(); while (dirtyRoots.size > 0);
      await document.fonts.ready;
      document.fonts.forEach(font => {
        if (font.status === "error") throw new Error(`HTML renderer font could not be loaded: ${font.family}`);
      });
    };
  });
  return async (frame: number, sources: readonly SourceFrameUpdate[] = []) => {
    const started = performance.now();
    const timing = await page.evaluate(async (input) => {
      const w = window as unknown as RenderWindow;
      const programStarted = performance.now();
      await w.__hypitFrameProgram.applyFrame(input.frame);
      const active = new Set(input.sources.map(source => source.id));
      for (const image of Array.from(document.querySelectorAll<HTMLImageElement>('[data-hypit-source-frame-image]'))) {
        if (!active.has(image.dataset.hypitSourceFrameImage!)) image.style.display = 'none';
      }
      const programMs = performance.now() - programStarted;
      const sourceStarted = performance.now();
      if (w.__hypitDrawVideoSources !== undefined) await w.__hypitDrawVideoSources(input.sources);
      else await Promise.all(input.sources.map(async source => {
        const plane = document.getElementById(source.elementId);
        if (!(plane instanceof HTMLElement)
          || !plane.hasAttribute("data-hypit-media-display-plane")) {
          throw new Error(`HTML Program media display plane ${source.elementId} is missing.`);
        }
        const hosts = plane.querySelectorAll<HTMLElement>(":scope > [data-hypit-media-payload-host]");
        if (hosts.length !== 1) throw new Error(`HTML Program media display plane ${source.elementId} has no unique payload host.`);
        const slots = hosts[0]!.querySelectorAll<HTMLElement>(":scope > [data-hypit-decoded-media-slot]");
        if (slots.length !== 1) throw new Error(`HTML Program media display plane ${source.elementId} has no unique payload slot.`);
        const slot = slots[0]!;
        let image = slot.querySelector<HTMLImageElement>(`[data-hypit-source-frame-image="${CSS.escape(source.id)}"]`);
        if (image === null) {
          image = document.createElement('img');
          image.dataset.hypitSourceFrameImage = source.id;
          image.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none";
          slot.append(image);
        }
        image.style.display = "block";
        if (image.src !== source.url) image.src = source.url;
        await image.decode();
      }));
      const sourceMs = performance.now() - sourceStarted;
      const readinessStarted = performance.now();
      await w.__hypitPrepareImages();
      if (w.__hypitHtmlVisualError !== undefined) throw new Error(w.__hypitHtmlVisualError);
      return { programMs, sourceMs, readinessMs: performance.now() - readinessStarted };
    }, { frame, sources });
    const processStarted = performance.now();
    const activeProcessStageKeys = processUsages
      .filter((usage) => usage.spans.some((span) => frame >= span.startFrame && frame < span.endFrameExclusive))
      .toSorted((left, right) => left.order - right.order)
      .flatMap((usage) => usage.stageKeys);
    const processPlan = await page.evaluate((stageKeys) => {
      const program = document.querySelector<HTMLElement>("[data-hypit-program-root]");
      if (program === null) throw new Error("HTML Program root is missing.");
      const width = Number(program.dataset.hypitWidth);
      const height = Number(program.dataset.hypitHeight);
      if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
        throw new Error("HTML Program canvas is invalid.");
      }
      const stages = stageKeys.map((key) => {
        const stage = document.getElementById(key);
        if (!(stage instanceof HTMLElement) || !stage.hasAttribute("data-hypit-process-stage")
          || stage.dataset.hypitProcessStageKey !== key) {
          throw new Error(`HTML Program Process stage ${key} is unavailable.`);
        }
        return { key, width, height };
      });
      return { width, height, stages };
    }, activeProcessStageKeys);
    if (processPlan.stages.length > 0 && page.screenshot === undefined) {
      throw new Error("Selected HTML renderer does not implement Visual Process input rasterization.");
    }
    for (const stage of processPlan.stages) {
      await page.evaluate(({ key }) => {
        const target = document.getElementById(key);
        if (!(target instanceof HTMLElement) || !target.hasAttribute("data-hypit-process-stage")) {
          throw new Error(`HTML Program Process stage ${key} is unavailable.`);
        }
        const changed = new Map<HTMLElement, string | null>();
        for (const child of Array.from(document.body?.children ?? [])) {
          if (!(child instanceof HTMLElement)) continue;
          changed.set(child, child.getAttribute("style"));
          // A root Process input is a compiler-owned fixed, full-canvas plane.
          // Remove peer body subtrees while retaining the stage's own layout;
          // no authored ancestor transform or filter is rewritten.
          child.style.display = "none";
        }
        target.style.display = "block";
        (window as unknown as {
          __hypitProcessCaptureRestore?: [HTMLElement, string | null][];
        }).__hypitProcessCaptureRestore = [...changed];
      }, { key: stage.key });
      try {
        const png = await page.screenshot!({
          type: "png",
          omitBackground: true,
          optimizeForSpeed: true,
          captureBeyondViewport: false,
          clip: { x: 0, y: 0, width: stage.width, height: stage.height },
        });
        const url = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
        await page.evaluate(async ({ key, url }) => {
          const images = Array.from(document.querySelectorAll<HTMLImageElement>("[data-hypit-process-raster-key]"))
            .filter(image => image.dataset.hypitProcessRasterKey === key);
          if (images.length === 0) throw new Error(`HTML Program Process input ${key} has no raster target.`);
          await Promise.all(images.map(async image => {
            if (image.src !== url) image.src = url;
            await image.decode();
          }));
        }, { key: stage.key, url });
      } finally {
        await page.evaluate(() => {
          const state = window as unknown as {
            __hypitProcessCaptureRestore?: [HTMLElement, string | null][];
          };
          for (const [element, previous] of (state.__hypitProcessCaptureRestore ?? []).reverse()) {
            if (previous === null) element.removeAttribute("style");
            else element.setAttribute("style", previous);
          }
          delete state.__hypitProcessCaptureRestore;
        });
      }
      await page.evaluate(async (frame) => {
        const w = window as unknown as RenderWindow;
        await w.__hypitFrameProgram.applyFrame(frame);
        await w.__hypitPrepareImages();
        if (w.__hypitHtmlVisualError !== undefined) throw new Error(w.__hypitHtmlVisualError);
      }, frame);
    }
    return {
      evaluationMs: performance.now() - started,
      ...timing,
      programMs: timing.programMs + (performance.now() - processStarted),
    } satisfies FramePreparationTiming;
  };
}
