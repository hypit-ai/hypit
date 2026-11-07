# `@hypit/html-document`

Portable browser playback document assembled from one completed `HtmlProgram` and one completed
`AudioProgram` with the same exact duration.

“Document” means the page closes picture, sound and playback controls into one browser host; it does
not imply that every media byte is embedded into one `.html` file. The material URL resolver may point
at adjacent files, HTTP resources or data URLs.

Direct callers use `compileHtmlDocument(program, audio)`. Author packages that want this product in a
Build graph can instantiate `htmlDocumentFragment`, supply its typed `program` and `audio` inputs, and
export the resulting `document` value. This package does not publish a Markup declaration or infer those
terminal programmes from an authoring model.

The `HtmlDocument` value retains the compiled `HtmlProgram` and `AudioProgram`.
The Programme gives every visual dependency a document-local identity separate from
its Result-store Blob identity, so recursive Blob rebinding never requires a reverse
resource table.

Hosts turn the result into HTML by supplying material URLs:

```ts
import { materializeHtmlDocument } from "@hypit/html-document";

const html = materializeHtmlDocument(document, artifact => materialUrl(artifact), {
  autoplay: true,
  loop: true,
  muted: true,
  responsive: true,
});
```

The URL resolver can return relative paths, HTTP URLs or data URLs. It must
provide every resource referenced by the document. Autoplay, looping, muting
and responsive canvas sizing default to `true`.

The generated page displays the composition inside the iframe's viewport:

```html
<iframe title="Preview" src="./preview.html"></iframe>
```

Hosts can also assign the generated HTML to `iframe.srcdoc`. The host page
provides any playback controls and uses the document's JavaScript API.

The page exposes `window.__hypitDocument` with `ready`, `play()`, `pause()`,
`seekFrame(frame)`, `setMuted(value)`, and read-only `frame` and `playing` values.
`ready` resolves when the initial frame and its materials are prepared.
Frame indices are integers in `[0, document.program.frameCount)`.
Audible playback follows the browser's user-activation policy.

An embedding parent can send playback commands through `postMessage`:

```ts
iframe.contentWindow.postMessage({
  type: "hypit.html-document.command@1",
  action: "seek",
  frame: 90,
}, "*");
```

Actions are `play`, `pause`, `seek` with `frame`, `mute` with `muted`, and `state`.
The document accepts commands from its embedding parent and serializes them.
It sends `hypit.html-document.state@1` messages containing `frame`, `frameCount`,
`frameRate` and `playing`, at up to ten updates per second during playback and
immediately after state changes. Command errors use `hypit.html-document.error@1`.
The parent checks that `event.source === iframe.contentWindow` before using a message.
