import type { Page } from "puppeteer-core";
import type { PictureInterpretation } from "@hypit/media";

/** The optional completion hooks supplied by the pinned HTML page runtime. */
type RenderWindow = Window & {
  __hypitFrameProgram: {
    prepare(spans?: readonly { readonly startFrame: number; readonly endFrameExclusive: number }[]): Promise<void>;
    applyFrame(frame: number): Promise<void>;
  };
  __hypitHtmlVisualError?: string;
  __hypitCaptureRoots?: readonly Element[];
  __hypitPrepareImages(): Promise<void>;
  __hypitPrepareDocumentImages(document: Document): Promise<void>;
  __hypitDrawVideoSources?(sources: readonly SourceFrameUpdate[]): Promise<void>;
};

export type SourceFrameUpdate = {
  readonly id: string;
  readonly documentPath: readonly string[];
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
        readonly timestamp: number;
        readonly streamIndex: number;
        readonly rotation: 0 | 90 | 180 | 270;
        readonly reverse: boolean;
      }
    | {
        /** Provider-private exact planar sample selected by the authored Map. */
        readonly kind: "i420p10" | "rgba8";
        readonly width: number;
        readonly height: number;
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

/** Install page-owned readiness and prepare one deterministic frame state. */
type FramePreparationPage = Pick<Page, "evaluate"> & { readonly screenshot?: Page["screenshot"] };

export async function createFramePreparer(page: FramePreparationPage) {
  // Image readiness belongs to this page. A seek can select a new image through
  // attributes, a CSS class or a pseudo-element after initial page readiness.
  await page.evaluate(() => {
    for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-hypit-source-frame]"))) {
      video.style.display = "none";
    }
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
    (window as unknown as RenderWindow).__hypitPrepareDocumentImages = async (owner) => {
      const view = owner.defaultView;
      if (view === null) throw new Error("HTML renderer nested document has no window");
      const pending: Promise<unknown>[] = [];
      const elements = owner.documentElement === null
        ? []
        : [owner.documentElement, ...Array.from(owner.documentElement.querySelectorAll("*"))];
      for (const element of elements) {
        if (element instanceof view.HTMLImageElement
          && (element.currentSrc || element.getAttribute("src") || element.getAttribute("srcset"))
          && (!element.complete || element.naturalWidth === 0)) {
          pending.push(element.decode().catch(error => {
            throw new Error(`HTML renderer image could not be decoded: ${element.currentSrc || element.src}`, { cause: error });
          }));
        }
        images.style(view.getComputedStyle(element), pending);
        for (const pseudo of ["::before", "::after"]) {
          const style = view.getComputedStyle(element, pseudo);
          if (style.content !== "none" && style.content !== "normal") images.style(style, pending);
        }
        if (element instanceof view.SVGImageElement) {
          const href = element.getAttribute("href") ?? element.getAttributeNS("http://www.w3.org/1999/xlink", "href");
          if (href) pending.push(images.load(new URL(href, owner.baseURI).href));
        }
      }
      await Promise.all(pending);
      await owner.fonts.ready;
      owner.fonts.forEach(font => {
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
      const nestedDocuments: Document[] = [document];
      for (let index = 0; index < nestedDocuments.length; index += 1) {
        for (const iframe of Array.from(nestedDocuments[index]!.querySelectorAll<HTMLIFrameElement>(
          "iframe[data-hypit-nested-composition][data-hypit-nested-active]"))) {
          if (iframe.contentDocument === null) throw new Error(`HTML Program active nested document ${iframe.id} is unavailable.`);
          nestedDocuments.push(iframe.contentDocument);
        }
      }
      const videos = nestedDocuments.flatMap(owner =>
        Array.from(owner.querySelectorAll<HTMLVideoElement>("video[data-hypit-source-frame]")));
      const active = new Set(input.sources.map(source => source.id));
      for (const owner of nestedDocuments) {
        for (const image of Array.from(owner.querySelectorAll<HTMLImageElement>('[data-hypit-source-frame-image]'))) {
          if (!active.has(image.dataset.hypitSourceFrameImage!)) image.style.display = 'none';
        }
      }
      const programMs = performance.now() - programStarted;
      const sourceStarted = performance.now();
      if (w.__hypitDrawVideoSources !== undefined) await w.__hypitDrawVideoSources(input.sources);
      else await Promise.all(input.sources.map(async source => {
        let owner = document;
        for (const iframeId of source.documentPath) {
          const view = owner.defaultView;
          const iframe = owner.getElementById(iframeId);
          if (view === null || !(iframe instanceof view.HTMLIFrameElement) || iframe.contentDocument === null) {
            throw new Error(`HTML Program nested document ${iframeId} is unavailable.`);
          }
          owner = iframe.contentDocument;
        }
        const video = owner.getElementById(source.elementId) as HTMLVideoElement | null;
        if (video === null) throw new Error(`HTML Program source element ${source.elementId} is missing.`);
        if (source.sample?.kind === "rgba8") {
          const { width, height, rotation } = source.sample;
          if (source.picture === undefined) throw new Error("Decoded video frame has no picture interpretation");
          const response = await fetch(source.url);
          if (!response.ok) throw new Error(`Decoded video frame returned ${response.status}: ${source.url}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength !== width * height * 4) throw new Error("Decoded RGBA frame has an invalid byte length");
          const picture = source.picture;
          if (picture.colorPrimaries !== "bt709" || (picture.colorTransfer !== "srgb" && picture.colorTransfer !== "bt709"))
            throw new Error("Decoded RGBA frame requires a supported SDR picture interpretation");
          const frame = new VideoFrame(bytes, { format: "RGBA", codedWidth: width, codedHeight: height, timestamp: 0,
            colorSpace: { primaries: "bt709", transfer: picture.colorTransfer === "srgb" ? "iec61966-2-1" : "bt709",
              matrix: "rgb", fullRange: true } });
          try {
            let canvas = owner.querySelector<HTMLCanvasElement>(`canvas[data-hypit-source-frame-image="${CSS.escape(source.id)}"]`);
            if (canvas === null) {
              canvas = owner.createElement("canvas");
              canvas.dataset.hypitSourceFrameImage = source.id;
              canvas.setAttribute("data-hypit-media-content", "");
              video.insertAdjacentElement("afterend", canvas);
            }
            canvas.style.display = "";
            canvas.width = rotation === 90 || rotation === 270 ? height : width;
            canvas.height = rotation === 90 || rotation === 270 ? width : height;
            const context = canvas.getContext("2d", { colorSpace: "srgb" });
            if (context === null) throw new Error("Decoded video canvas could not be created");
            context.translate(canvas.width / 2, canvas.height / 2);
            context.rotate(-rotation * Math.PI / 180);
            context.drawImage(frame, -width / 2, -height / 2);
          } finally { frame.close(); }
          return;
        }
        let image = owner.querySelector<HTMLImageElement>(`[data-hypit-source-frame-image="${CSS.escape(source.id)}"]`);
        if (image === null) {
          image = owner.createElement('img');
          image.dataset.hypitSourceFrameImage = source.id;
          image.setAttribute('data-hypit-media-content', '');
          video.insertAdjacentElement('afterend', image);
        }
        image.style.display = "";
        if (image.src !== source.url) image.src = source.url;
        await image.decode();
      }));
      const sourceMs = performance.now() - sourceStarted;
      for (const video of videos) video.style.display = "none";
      const readinessStarted = performance.now();
      await w.__hypitPrepareImages();
      for (const owner of nestedDocuments.slice(1)) await w.__hypitPrepareDocumentImages(owner);
      if (w.__hypitHtmlVisualError !== undefined) throw new Error(w.__hypitHtmlVisualError);
      return { programMs, sourceMs, readinessMs: performance.now() - readinessStarted };
    }, { frame, sources });
    const processStarted = performance.now();
    const processPlan = await page.evaluate(() => {
      const program = document.querySelector<HTMLElement>("[data-hypit-program-root]");
      if (program === null) throw new Error("HTML Program root is missing.");
      const width = Number(program.dataset.hypitWidth);
      const height = Number(program.dataset.hypitHeight);
      if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
        throw new Error("HTML Program canvas is invalid.");
      }
      const documents: { owner: Document; depth: number; path: string[] }[] = [{ owner: document, depth: 0, path: [] }];
      for (let index = 0; index < documents.length; index += 1) {
        const entry = documents[index]!;
        for (const iframe of Array.from(entry.owner.querySelectorAll<HTMLIFrameElement>("iframe[data-hypit-nested-composition][data-hypit-nested-active]"))) {
          if (iframe.contentDocument === null) throw new Error(`HTML Program active nested document ${iframe.id} is unavailable.`);
          documents.push({ owner: iframe.contentDocument, depth: entry.depth + 1, path: [...entry.path, iframe.id] });
        }
      }
      const stages = documents.flatMap((entry, ownerIndex) => {
        const ownerProgram = entry.owner.querySelector<HTMLElement>("[data-hypit-program-root]");
        const ownerWidth = Number(ownerProgram?.dataset.hypitWidth);
        const ownerHeight = Number(ownerProgram?.dataset.hypitHeight);
        if (!Number.isSafeInteger(ownerWidth) || ownerWidth <= 0
          || !Number.isSafeInteger(ownerHeight) || ownerHeight <= 0) {
          throw new Error("HTML Program nested canvas is invalid.");
        }
        return Array.from(entry.owner.querySelectorAll<HTMLElement>("[data-hypit-process-stage]")).map((stage, stageIndex) => ({
          ownerIndex,
          documentPath: entry.path,
          stageIndex,
          depth: entry.depth,
          order: Number(stage.dataset.hypitProcessOrder),
          key: stage.dataset.hypitProcessStageKey ?? "",
          width: ownerWidth,
          height: ownerHeight,
        }));
      });
      for (const stage of stages) if (!Number.isSafeInteger(stage.order) || stage.order <= 0 || stage.key.length === 0) {
        throw new Error("HTML Program Process stage is invalid.");
      }
      return { width, height, stages: stages.toSorted((left, right) => right.depth - left.depth
        || left.ownerIndex - right.ownerIndex || left.order - right.order || left.stageIndex - right.stageIndex) };
    });
    if (processPlan.stages.length > 0 && page.screenshot === undefined) {
      throw new Error("Selected HTML renderer does not implement Visual Process input rasterization.");
    }
    for (const stage of processPlan.stages) {
      await page.evaluate(({ documentPath, stageIndex, width, height }) => {
        const entry: { owner: Document; chain: HTMLIFrameElement[] } = { owner: document, chain: [] };
        for (const id of documentPath) {
          const iframe = entry.owner.getElementById(id) as HTMLIFrameElement | null;
          if (iframe?.contentDocument == null) throw new Error('HTML Program Process owner document is unavailable.');
          entry.chain.push(iframe);
          entry.owner = iframe.contentDocument;
        }
        const target = Array.from(entry.owner.querySelectorAll<HTMLElement>("[data-hypit-process-stage]"))[stageIndex];
        if (target === undefined) throw new Error("HTML Program Process stage is unavailable.");
        const changed = new Map<HTMLElement, string | null>();
        const owners: Document[] = [document];
        for (const iframe of entry.chain) if (iframe.contentDocument !== null) owners.push(iframe.contentDocument);
        for (const owner of owners) {
          for (const child of Array.from(owner.body?.children ?? [])) {
            if (owner.defaultView === null || !(child instanceof owner.defaultView.HTMLElement)) continue;
            if (!changed.has(child)) changed.set(child, child.getAttribute("style"));
            // Process stages are body-level siblings of the authored programme.
            // `visibility` is not an isolation boundary: a frame programme may
            // explicitly restore `visibility: visible` on a descendant Present.
            // Remove every unrelated body subtree from layout while capturing
            // the selected stage so no peer picture can be baked into its input.
            child.style.display = "none";
          }
        }
        for (const iframe of entry.chain) {
          for (let current: HTMLElement | null = iframe; current !== null; current = current.parentElement) {
            if (!changed.has(current)) changed.set(current, current.getAttribute("style"));
            const previous = changed.get(current);
            if (previous === null) current.removeAttribute("style");
            else if (previous !== undefined) current.setAttribute("style", previous);
            current.style.visibility = "visible";
            current.style.transform = "none";
            current.style.filter = "none";
          }
          if (!changed.has(iframe)) changed.set(iframe, iframe.getAttribute("style"));
          iframe.style.position = "fixed";
          iframe.style.inset = "0";
          iframe.style.width = `${width}px`;
          iframe.style.height = `${height}px`;
          iframe.style.border = "0";
          iframe.style.zIndex = "2147483647";
        }
        for (const candidate of Array.from(entry.owner.querySelectorAll<HTMLElement>("[data-hypit-process-stage]"))) {
          if (!changed.has(candidate)) changed.set(candidate, candidate.getAttribute("style"));
          candidate.style.display = candidate === target ? "block" : "none";
        }
        for (let current: HTMLElement | null = target; current !== null; current = current.parentElement) {
          if (!changed.has(current)) changed.set(current, current.getAttribute("style"));
          current.style.visibility = "visible";
          current.style.transform = "none";
          current.style.filter = "none";
        }
        (window as unknown as {
          __hypitProcessCaptureRestore?: [HTMLElement, string | null][];
        }).__hypitProcessCaptureRestore = [...changed];
      }, { documentPath: stage.documentPath, stageIndex: stage.stageIndex, width: stage.width, height: stage.height });
      try {
        const png = await page.screenshot!({
          type: "png",
          omitBackground: true,
          optimizeForSpeed: true,
          captureBeyondViewport: false,
          clip: { x: 0, y: 0, width: stage.width, height: stage.height },
        });
        const url = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
        await page.evaluate(async ({ documentPath, key, url }) => {
          let owner = document;
          for (const id of documentPath) {
            const iframe = owner.getElementById(id) as HTMLIFrameElement | null;
            if (iframe?.contentDocument == null) throw new Error('HTML Program Process owner document is unavailable.');
            owner = iframe.contentDocument;
          }
          const images = Array.from(owner.querySelectorAll<HTMLImageElement>("[data-hypit-process-raster-key]"))
            .filter(image => image.dataset.hypitProcessRasterKey === key);
          if (images.length === 0) throw new Error(`HTML Program Process input ${key} has no raster target.`);
          await Promise.all(images.map(async image => {
            if (image.src !== url) image.src = url;
            await image.decode();
          }));
        }, { documentPath: stage.documentPath, key: stage.key, url });
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

/** Capture one prepared page state as an opaque PNG for the portable path or an authored frame result. */
export async function createOpaqueFrameCapture(page: Page, canvas: { readonly width: number; readonly height: number },
  matte: string) {
  const cdp = await page.createCDPSession();
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(matte);
  if (match === null) throw new Error("HTML renderer matte must be an opaque hexadecimal color");
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: {
    r: Number.parseInt(match[1]!, 16), g: Number.parseInt(match[2]!, 16), b: Number.parseInt(match[3]!, 16), a: 1,
  } });
  const prepare = await createFramePreparer(page);
  return async (frame: number, sources: readonly SourceFrameUpdate[] = []) => {
    const timing = await prepare(frame, sources);
    const started = performance.now();
    const result = await cdp.send("Page.captureScreenshot", {
      format: "png", optimizeForSpeed: true, fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: canvas.width, height: canvas.height, scale: 1 },
    });
    return { buffer: Buffer.from(result.data, "base64"), ...timing,
      outputMs: performance.now() - started };
  };
}
