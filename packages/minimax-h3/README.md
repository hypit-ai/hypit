# `@hypit/minimax-h3`

Exact author/compute contracts and package-owned author Surfaces for MiniMax H3 video generation.

Text, first/last-frame and subject-reference modes are separate Surfaces rather than one dynamic
port mode. Each produces an ordinary video Artifact. This package owns request semantics
and validation only; Provider calls, credentials, retries and queueing belong to a Runtime Endpoint
such as `@hypit/provider-kie`.

```xml
<h3:TextVideo id="idea" prompt={prompt} duration="6" resolution="768P" aspect-ratio="9:16"/>
<h3:FrameVideo id="motion" prompt={motionPrompt} duration="6" resolution="2K"
  first-frame={cover.image} last-frame={ending.image}/>
<h3:ReferenceVideo id="montage" prompt={montagePrompt} duration="8" resolution="768P" aspect-ratio="9:16">
  <h3:Reference image={person.image}/>
  <h3:Reference video={gesture.video}/>
</h3:ReferenceVideo>
```

The Surface makes every prompt/media dependency an explicit graph edge and leaves execution to a Provider.
