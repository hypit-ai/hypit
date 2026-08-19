#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createReferenceVideoTools } from "./tools.js";

const tools = createReferenceVideoTools();
const server = new McpServer({ name: "hypit-reference-video-tools", version: "0.0.0-dev" });

server.registerTool("prepare_reference", {
  description: "Prepare a local reference video, split its shots, extract continuity media, and analyze recurring people, product, and voices.",
  inputSchema: { video_path: z.string().min(1), rebuild: z.boolean().optional() },
}, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await tools.prepare_reference({
  video_path: input.video_path,
  ...(input.rebuild === undefined ? {} : { rebuild: input.rebuild }),
})) }] }));

server.registerTool("observe_reference", {
  description: "Observe reference shots and boundaries in parallel using narrow natural-language visual and audio Gemini requests.",
  inputSchema: {
    reference_id: z.string().min(1),
    shot_ids: z.array(z.string().min(1)).optional(),
    question: z.string().optional(),
    refresh: z.boolean().optional(),
  },
}, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await tools.observe_reference({
  reference_id: input.reference_id,
  ...(input.shot_ids === undefined ? {} : { shot_ids: input.shot_ids }),
  ...(input.question === undefined ? {} : { question: input.question }),
  ...(input.refresh === undefined ? {} : { refresh: input.refresh }),
})) }] }));

server.registerTool("inspect_svml_vocabulary", {
  description: "Read the currently installed SVML vocabulary declarations and previews from selected packages.",
  inputSchema: {
    package_names: z.array(z.string().min(1)).min(1),
    tags: z.array(z.string().min(1)).optional(),
    include_previews: z.boolean().optional(),
  },
}, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await tools.inspect_svml_vocabulary({
  package_names: input.package_names,
  ...(input.tags === undefined ? {} : { tags: input.tags }),
  ...(input.include_previews === undefined ? {} : { include_previews: input.include_previews }),
})) }] }));

await server.connect(new StdioServerTransport());
