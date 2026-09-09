# Making videos with an Agent

Give your Agent a reference video, a brief, or both. You can bring a face, product, logo, or existing
footage and explain what the new video should achieve. The Agent studies the material, develops a
creative direction, and makes the pictures, performances, graphics, sound, and edits work together.

## Install the Skill

```bash
npx skills add hypit-ai/hypit -g
```

The Skill supplies production knowledge. The executable `hypit` package supplies the commands,
components, Runtime, and Studio. Your Agent can locate an existing executable installation or prepare
the selected release. The Skill, executable, and video project have independent locations and update
through their own installation channels.

## Develop the work

Understanding a reference moves between the whole piece and the details that explain it: why the
opening catches attention, how a performance carries the argument, and what pictures, captions,
graphics, and sound contribute. Word-timed transcripts and frame sequences help locate the details:
what enters, how it moves, and why it matters at that point. The Agent records the overall reading
and the precise observations in the project's reference notes.

Making the target moves between intention and visible results. Replacing a presenter or product can
change the script, performance, setting, and payoff as well as the reference images. The Agent works
through those consequences with the new goal in mind. It puts the visual identity, reference
relationships, pronunciation and performance direction into the image prompts, Script and video
prompts before generating material. Components and captions can be developed while generation runs.
With the actual material present, a focused composition review checks hierarchy, placement,
entrances, exits and timing against the intended effect.

You decide the goal, private facts, service accounts and spending. The Agent checks relevant existing
capabilities and explains the choices when something is missing. For a spoken reference, that can
mean preparing local WhisperX or choosing hosted transcription; image and video generation can use
supported services with your own keys or a HypiHub account.

Before paid work, agree on the account, scope and budget using the available pricing information.
The Agent handles ordinary creative and technical decisions within that commission, explains its
findings and progress, and brings changes in scope or cost back to you.

## Keep the project editable

The project keeps the work in ordinary files:

- Reference notes explain the source video's structure and locatable details.
- Brief and Treatment describe the user's goal and the Agent's creative answer.
- `.svml` describes the Script, media, components, and composition; `.svs` holds reusable Recipes.
- `.svrun` selects the Author Source, existing Outputs, and the targets for one execution.
- Build Results retain produced Outputs and the facts of that execution.

Project components are part of making a video. They live with the project and can express a new
visual role, Caption family, or graphic behavior. Content that shares layout or motion can form one
scene; independent graphics and captions can stay separate. Spoken work uses Script events to drive
these relationships, while purely visual animation can use an authored clock. A component that needs cross-project reuse can be
published as an ordinary versioned package under its owner's scope.

When revising the work, the Run can reuse suitable Outputs from earlier Results, including useful
media produced before a Build failed. A new Build executes the revised Run. Studio displays the
selected work and writes supported edits back to its Source files; the Agent reviews the actual
finished video against the intended result.

[Quickstart](../quickstart.md) walks through making a video with your Agent.
[Runs and Builds](../quickstart/run.md) explains execution and Output reuse.
[Studio](../quickstart/preview.md) explains interactive preview and editing.
