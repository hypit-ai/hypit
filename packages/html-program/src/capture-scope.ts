/**
 * Publish the DOM roots which can paint this render's selected absolute frames.
 * The consumer sees only DOM roots; Present and frame semantics stay here.
 */
export const presentationCaptureScopeRuntime = String.raw`
htmlRegisterFrameProgramInitializer(() => {
  const selected = [];
  const presents = [...document.querySelectorAll('[data-hypit-present-start-frame][data-hypit-present-end-frame]')];
  const media = (root) => [root, ...root.querySelectorAll('img,source,video,audio,image')];
  const activate = (root) => {
    for (const element of media(root)) {
      for (const attribute of ['src', 'href']) {
        const deferred = 'data-hypit-resource-' + attribute;
        const value = element.getAttribute(deferred);
        if (value === null) continue;
        // Compiler-planned temporal sampling is decoded once by the Provider
        // and supplied as exact source frames. Leaving its URL inert prevents
        // every browser Worker from independently traversing the same video.
        // Studio has no frame selection and therefore keeps native playback.
        if (htmlRequestedFrameSpans !== null && attribute === 'src'
          && element.matches('video[data-hypit-source-frame]')) continue;
        element.setAttribute(attribute, value);
        element.removeAttribute(deferred);
      }
    }
  };
  const exclude = (root) => {
    root.setAttribute('data-hypit-capture-excluded', '');
    root.style.setProperty('display', 'none', 'important');
    for (const element of media(root)) {
      const name = element.localName;
      const attributes = name === 'img' || name === 'source' ? ['src', 'srcset']
        : name === 'video' ? ['src', 'poster']
        : name === 'audio' ? ['src']
        : name === 'image' ? ['href'] : [];
      for (const attribute of attributes) element.removeAttribute(attribute);
      element.removeAttribute('data-hypit-resource-src');
      element.removeAttribute('data-hypit-resource-href');
      if (name === 'image') element.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
    }
    // The complete document has already been parsed, but a render Worker will
    // never request this Present. Detach it before DOMContentLoaded so generic
    // browser adapters discover only live selected work. Compiler-owned shared
    // definitions live outside Present roots; Present-local masks, paths and
    // HtmlVisual structure leave with their owner.
    root.remove();
  };
  for (const root of presents) {
    const startFrame = Number(root.getAttribute('data-hypit-present-start-frame'));
    const endFrameExclusive = Number(root.getAttribute('data-hypit-present-end-frame'));
    if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrameExclusive)
      || startFrame < 0 || endFrameExclusive <= startFrame) {
      throw new Error('HTML renderer Present has an invalid capture span.');
    }
    if (htmlSelectionOverlaps(startFrame, endFrameExclusive)) selected.push(root);
    else exclude(root);
  }
  // Compiler-owned direct media URLs become observable to the browser only
  // after unrelated Present roots are gone. Opaque author HTML remains opaque.
  for (const root of selected) activate(root);
  const definitions = [...document.querySelectorAll('[data-hypit-document-definitions]')];
  Object.defineProperty(globalThis, '__hypitCaptureRoots', {
    value: Object.freeze([...definitions, ...selected]),
    writable: false,
    configurable: false,
  });
});`;
