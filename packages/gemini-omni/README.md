# `@hypit/gemini-omni`

Exact author/compute contract and package-owned author Surface for Gemini Omni video generation.

It defines one `video` endpoint with duration, aspect ratio, resolution and bounded image, opaque
audio, video-range and character references. It validates and seals requests, then projects the
primary result to an ordinary video Artifact.

The package does not call an API. `@hypit/provider-kie` is one separately selected Runtime Endpoint
implementation; another Provider can implement the same exact capability without changing Core.

```xml
<omni:Video id="scene" prompt={prompt} duration="8" aspect-ratio="9:16" resolution="1080p" seed="42">
  <omni:Image image={person.image}/>
  <omni:Excerpt video={reference.video} start-sec="1.5" end-sec="4"/>
  <omni:AudioId value="voice-id"/>
  <omni:CharacterId value="character-id"/>
</omni:Video>
```

Opaque service IDs are authored scalar request values; actual media stay explicit Artifact edges.
