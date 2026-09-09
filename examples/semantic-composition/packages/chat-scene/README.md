# Chat scene

A project component for a conversation whose arrivals, bubble layout and scrolling belong together.
Content lives in Source. Every Message has its own `at`; there is no fixed message count.

For speech-led work, bind the message to the words that introduce it:

```svml
<chat:Scene id="conversation" semantic={speech.semantic} canvas={canvas} font={font}
  during={story.selection.demo} title="Conversation">
  <chat:Message id="answer" sender="Maya" side="left" text="Here it is."
    at={story.moment.answer}/>
</chat:Scene>
```

The same component can receive `space={animation}` and `at="2s"` for authored animation. A Scene
has an outer Window; its message Instants trigger persistent state. `entrance-frames` controls arrival
and scrolling duration independently of those triggers (default 10). Messages stay visible or scroll
up as the conversation develops. Message times are on the film clock and must fall inside the Scene.

The Surface uses the shared temporal helpers and expands children to a finite create/append/render
graph. The rendering function receives ProgramSpace, Window and Instants, so it knows nothing about
Script parsing, speech models or Runtime. The browser program evaluates any requested frame directly,
including frames reached by scrubbing, range rendering or concurrent workers.

Compile with `npm run build`. The package uses the public `@hypit/hypit/*` interfaces and can live in any
video project's `packages/`. It is an example to adapt, not an official component to install for every
animation. The complete runnable Source is [chat.svml](../../chat.svml); see the surrounding
example README for commands. `font` receives a FontStack, for example from `fonts:Stack`.
