# Dynamic brief intake for original authoring

An original-authoring request is not ready for Source merely because it contains a format name or a
single sentence. First freeze a brief that is sufficient to choose the narrative, Script, visual
semantics, timing, facts and paid generation inputs.

## Discover examples, never classify by filename

From the Hypit checkout root, inspect `examples/` when it exists. Enumerate complete projects and
read each candidate's `main.svml`, `recipes.svs`, `build.svrun`, and relevant package README. A
read-only `hypit check` is allowed. Do not copy its Source, facts, people, assets, prompts or source
closure into the new project. Directory names, file names and component counts are only search clues.

For each candidate, read in this order:

```text
Script / Narrative
→ what the author wants the viewer to understand, believe, feel or do
→ opening attention strategy and Hook
→ narrative expansion, proof, reversal and payoff
→ visual, audio and text relationships
→ Recipe / Surface expression
→ Graph / Run implementation
```

Write an intent summary in your own words. It must distinguish what the Source explicitly says from
what you infer, and identify decisions that affect Graph structure, Script cuts, visual meaning,
timing, factual claims or paid generation. Compare the user's request with that summary. Ask only
for the high-impact decisions the request leaves unresolved. Never turn an example into a template or
a hard-coded type-specific questionnaire; an opening provocation is evidence of that author's Hook,
not a rule for a purported format.

## General fallback when no example matches

If `examples/` is absent, empty, or semantically unlike the request, do not start Source and do not
skip intake. Use the user's words, installed vocabulary, craft references and the compilable SVML/SVS
/SVRun structure to derive an open-ended intent hypothesis:

- the promised viewer result and the central claim or tension;
- a plausible attention strategy and what expectation it creates;
- how the idea should develop and resolve;
- which visual, audio and text changes carry that meaning;
- which decisions are already made, which low-risk implementation details you may choose, and which
  core facts, claims, Hook, audience promise, timing or paid inputs require confirmation.

This is an analysis method, not a list of ranking, interview, podcast or other type questions. Keep
the brief unfrozen while any unresolved answer could change the program's intent or graph.

## Durable brief

Persist a concise `.hypit/brief` file (JSON or Markdown; do not put it in Author Source) containing:

- user goal and audience;
- intent, Hook/attention strategy and narrative progression;
- visual/audio/text relationships;
- example project path and digest, or the general-analysis basis;
- confirmed decisions and unresolved questions;
- the expected SVML/SVS/SVRun structural consequences.

Checkpoint `brief-frozen` only after unresolved questions no longer affect those consequences. An
agent may select fonts, package details and model tier when they are genuinely low risk; it may not
invent core facts, ranking criteria, claims, Hook or audience promises. The brief is the reference for
later review and revision, not a copy of an example.
