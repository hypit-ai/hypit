# `@hypit/volcengine-matting`

Provider-neutral portrait-video matting. The package removes a moving portrait's background and
returns a generated video Blob whose alpha can later be used by an audiovisual Source or another
generation operation.

The capability is `@hypit/volcengine-matting@1#matte-portrait-video`. Its model fields are:

- `source`: one video reference;
- `format`: `WEBM` by default, or `MOV` for transparent QuickTime output.

The service's flat-background MP4 option is a different treatment and is not exposed by this model.
The request contains no prompt, duration, Timeline, Track or placement. Matting preserves the source
performance; an `AudiovisualProgram` occurrence later decides where, when and over which picture the
result appears.

Existing transparency enters the ordinary Media/PreparedMedia path. Trimming, speed changes and
spatial placement are occurrence relationships, not fields on the generated Blob and not reusable
root transforms in this package.

## Provider

The HypiHub Provider maps the capability to `POST /v1/videos` with
`model: "matte-portrait-video"`, `ref_video_url` and `format`. Credentials, submission, polling,
collection and Result storage remain responsibilities of the selected Runtime Endpoint.

```json
{
  "bindings": {
    "@hypit/volcengine-matting@1#matte-portrait-video": "hypihub.default"
  }
}
```

`hypihub.default` is an Endpoint ID from a runtime profile. The Model describes the operation; it
does not select or hard-code the Provider.
