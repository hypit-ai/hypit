/** Draw each active alpha mask after its two Picture inputs have reached the requested frame. */
export const alphaMaskRuntime = String.raw`
const alphaMasks = [...document.querySelectorAll('canvas[data-hypit-alpha-mask]')];
const drawableVisuals = alphaVisualAssets.map(({id, urls}) => ({ root: document.getElementById(id), urls }));
const drawableImageURLs = new Map();
const drawableImageLoads = new Map();

function loadDrawableImage(url) {
  const pending = drawableImageLoads.get(url);
  if (pending) return pending;
  const load = fetch(url, { mode: 'cors' }).then(async response => {
    if (!response.ok) throw new Error('Cannot read Picture Alpha image ' + url + '.');
    const drawable = URL.createObjectURL(await response.blob());
    drawableImageURLs.set(url, drawable);
    return drawable;
  }).catch(error => {
    drawableImageLoads.delete(url);
    throw error;
  });
  drawableImageLoads.set(url, load);
  return load;
}

async function bindDrawableVisual(visual) {
  await Promise.all(visual.urls.map(loadDrawableImage));
  const alternatives = visual.urls.map(url => url.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&'));
  const references = new RegExp('(?:' + alternatives.join('|') + ')(?![\\w%:/?#.-])', 'g');
  const bind = value => value.replace(references, url => drawableImageURLs.get(url));
  for (const element of visual.root.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      const value = bind(attribute.value);
      if (value !== attribute.value) attribute.value = value;
    }
    if (element.localName === 'style') element.textContent = bind(element.textContent);
  }
}

/** A sandboxed Programme binds its declared project image bytes to its own drawable origin. */
async function prepareDrawableVisuals(active) {
  await Promise.all(drawableVisuals.filter(visual => active(visual.root)).map(visual => {
    visual.ready ??= bindDrawableVisual(visual).catch(error => {
      delete visual.ready;
      throw error;
    });
    return visual.ready;
  }));
}

function paintAlphaMask(canvas, signal) {
  if (typeof canvas.requestPaint !== 'function') {
    throw new Error('Picture Alpha compositing requires a browser with HTML-in-Canvas.');
  }
  const context = canvas.getContext('2d');
  if (!context || typeof context.drawElementImage !== 'function') {
    throw new Error('Picture Alpha compositing requires an HTML-in-Canvas 2D context.');
  }
  if (signal?.aborted) return Promise.reject(signal.reason);
  const [content, matte] = canvas.children;
  return new Promise((resolve, reject) => {
    const abort = () => {
      canvas.removeEventListener('paint', paint);
      reject(signal.reason);
    };
    const paint = () => {
      signal?.removeEventListener('abort', abort);
      try {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';
        context.drawElementImage(content, 0, 0, canvas.width, canvas.height, { preserveElementGeometry: true });
        context.globalCompositeOperation = 'destination-in';
        context.drawElementImage(matte, 0, 0, canvas.width, canvas.height, { preserveElementGeometry: true });
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        context.globalCompositeOperation = 'source-over';
      }
    };
    canvas.addEventListener('paint', paint, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    canvas.requestPaint();
  });
}

async function paintAlphaMasks(signal) {
  const visible = alphaMasks.filter(canvas => canvas.getClientRects().length > 0);
  await Promise.all(visible.map(canvas => paintAlphaMask(canvas, signal)));
}
`;
