# @hypit/html-document

Build a browser-playable document from a Composition:

This is an exportable browser playback document, not Studio's preview foundation. “Document” means
the page closes picture, sound, clock and playback controls into one browser host; it does not imply
that every media byte is embedded into one `.html` file. The material URL resolver may point at
adjacent files, HTTP resources or data URLs. Studio and
`HtmlDocument` are separate hosts of `@hypit/html-playback`: Studio compiles `HtmlProgram` and
`AudioProgram` directly for its current session, while this package closes the same Programmes and
their material bindings into a portable page with an embedding API. A Studio rewrite can replace its
host or use a Provider-backed exact preview without changing or passing through `HtmlDocument`.

```xml
<import as="page" from="@hypit/html-document@1"/>
<page:Document id="preview" composition={main.composition}/>
```

The package-owned declaration consumes the completed Composition directly. Its Timeline is already
part of that value, so accepting a second Timeline would permit a contradictory clock. Markup contributes only the `Document` spelling, while direct
APIs and other Frontends use the same declaration compiler.

Select the document as an explicit Build target:

```bash
hypit plan main.svml --target preview.document
hypit build main.svml --target preview.document
```

The `HtmlDocument` result contains a compiled `HtmlProgram` and its `AudioProgram`.
The Programme gives every visual dependency a document-local identity separate from
its Result-store Blob identity, so recursive Blob rebinding never requires a reverse
resource table. The Author Source owns durable material references; the command selects only the
document Target.

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
