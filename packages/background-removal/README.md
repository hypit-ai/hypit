# @narratage/background-removal

Declares one external image capability: turn an input image into an image with its background removed.

```xml
<remove:Background id="cutout" source={portrait.image}/>
```

The package does not choose a model, API, threshold, queue, or storage service. Those belong to the selected Endpoint. `@narratage/provider-kie` can fulfill this capability with KIE Recraft; another runtime may bind a local model without changing the author graph.
