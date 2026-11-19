# @hypit/whisperx

`whisperX` defines a transcription Capability with a named audio input. Its Publication output
`transcript` owns a `transcript-json` file of type `application/json`. The document contains the language
and one ordered list of words, with second-based boundaries for words that were located in the source.

```sh
hypit execution resource "$invocation" --output transcript --resource transcript-json --to transcript.json
```
