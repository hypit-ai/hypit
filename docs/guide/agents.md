---
title: Use Hypit in your Agent
description: Choose a place to work with your Agent, install Hypit, and keep your video project accessible.
---

Hypit gives your Agent video-production knowledge and executable tools. You work with the Agent;
it reads and edits the project, creates material, and runs the composition. Your choice of Agent
is separate from the [model and deployment services](./service-partners.md) used to make material.

## Start in your working environment

Claude Code and Codex are common starting points. Open your video project in the Agent and install
the Hypit Skill through its supported skill installer. For the skills CLI:

```bash
npx skills add hypit-ai/hypit -g
```

The Agent can then locate or install the `@hypit/hypit` executable. Give it a reference video or a
brief and describe the result you want. [Quickstart](../quickstart.md) covers the production itself.
Listing an Agent here describes a way to use Hypit; partnerships are identified separately below.

A terminal, desktop app or browser can each be the front door. What matters is the environment
behind it: access to project files, an execution environment for Hypit and its selected tools,
and a way to show you the work. With a remote Agent, upload or connect the material to its working
environment and use that environment's preview forwarding or file delivery. A localhost address on
the remote machine is not a preview address on your computer.

The project and generated material should remain accessible when a conversation or temporary
session ends. Your Agent can explain where they are saved, show focused frames or intervals for
feedback, and revise the Sources or components that own the requested change. Reviewing the
composition and exporting the final video are separate actions.

## Agent-entry partner: OpenAgents

[OpenAgents](https://openagents.org/) is a Hypit partner on the Agent-entry side. Its
[Launcher and workspace documentation](https://openagents.org/docs/en/launcher/what-is-launcher)
describes managing coding agents and connecting them to a shared workspace.

Use Hypit in the working environment of the Agent you run there. The Hypit Skill's maintained
source is the repository's [`skills/hypit/`](https://github.com/hypit-ai/hypit/tree/main/skills/hypit)
directory; a Skill installer should include its references and supporting files. Follow the
current entry and installation options provided by OpenAgents, then use the same Hypit production
tools and project files. The chosen installer owns Skill updates; the executable has its own
package installation. Model-service accounts are a separate choice.

## Connecting another Agent environment

An integration can make the Skill available, expose project files and command execution, and
provide a route to previews and exported files. It uses the same Hypit interfaces; video syntax
and Providers do not need an Agent-specific variant. Start with the capabilities your environment
actually exposes, and make the location and lifetime of the work clear to the user.

For material generation, see [Models and Providers](./providers.md) and
[model and deployment service partners](./service-partners.md).
