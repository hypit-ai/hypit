import { DurableObject } from "cloudflare:workers";
import {
  CAPTION_EDIT_MODEL,
  FalError,
  IMAGE_MODEL,
  MERGE_MODEL,
  captionEditInput,
  isTerminal,
  mediaUrl,
  mergeInput,
  refusal,
  result,
  status,
  submit,
  videoInput,
  videoModelId,
} from "./fal.ts";
import { clipDurations } from "../src/timing.ts";
import { captionCues, cuesToVtt } from "./hypit.ts";
import {
  briefFromBrowser,
  createBrowserTask,
  getBrowserTask,
  isBrowserTerminal,
  pageKey,
  stopBrowserTask,
  type PageBrowse,
} from "./browser-use.ts";
import { listCcSkills } from "./cc-skills.ts";
import { explorePage } from "./explore.ts";
import { OPENROUTER_MODEL, planShots } from "./openrouter.ts";
import {
  FORMAT_IDS,
  SOCIAL_DESTINATIONS,
  type Artifact,
  type Job,
  type Project,
  type ProjectInput,
  type ReviewState,
  type SocialDestination,
} from "./types.ts";

export type StudioEnv = {
  FAL_KEY?: string;
  OPENROUTER_API_KEY?: string;
  BROWSER_USE_API_KEY?: string;
  MEDIA: R2Bucket;
  STUDIO: DurableObjectNamespace<StudioDO>;
};

const MAX_EVENTS = 300;

class RequestError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function now(): string {
  return new Date().toISOString();
}

function event(project: Project, type: string, message: string): Project {
  const next: Project = {
    ...project,
    updatedAt: now(),
    events: [{ id: crypto.randomUUID(), type, message, createdAt: now() }, ...project.events].slice(0, MAX_EVENTS),
  };
  return next;
}

function stringField(value: unknown, name: string, maximum: number, minimum = 1): string {
  if (typeof value !== "string" || value.trim().length < minimum || value.trim().length > maximum) {
    throw new RequestError(400, `${name} must contain ${minimum}–${maximum} characters.`);
  }
  return value.trim();
}

function projectInput(body: Record<string, unknown>): ProjectInput {
  const prompt = stringField(body.prompt, "Prompt", 12000, 3);
  const title =
    body.title === undefined || body.title === ""
      ? prompt.split(/[\n.!?]/)[0]!.slice(0, 80) || "Untitled video"
      : stringField(body.title, "Title", 120);
  if (body.aspectRatio !== "9:16" && body.aspectRatio !== "16:9" && body.aspectRatio !== "1:1") {
    throw new RequestError(400, "Choose a 9:16, 16:9, or 1:1 aspect ratio.");
  }
  if (typeof body.duration !== "number" || !Number.isInteger(body.duration) || body.duration < 5 || body.duration > 300) {
    throw new RequestError(400, "Duration must be a whole number of seconds between 5 and 300.");
  }
  const style = stringField(body.style, "Style", 100);
  let format: string | undefined;
  if (body.format !== undefined && body.format !== "") {
    format = stringField(body.format, "Format", 80);
    if (!FORMAT_IDS.includes(format as (typeof FORMAT_IDS)[number])) throw new RequestError(400, "Choose a Hypit production format.");
  }
  let referenceUrl: string | undefined;
  if (body.referenceUrl !== undefined && body.referenceUrl !== "") {
    referenceUrl = stringField(body.referenceUrl, "Reference URL", 2048);
    try {
      const url = new URL(referenceUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {
      throw new RequestError(400, "Use a complete public http(s) reference URL without login details.");
    }
  }
  return {
    title,
    prompt,
    aspectRatio: body.aspectRatio,
    duration: body.duration,
    style,
    ...(format === undefined ? {} : { format }),
    ...(referenceUrl === undefined ? {} : { referenceUrl }),
  };
}

export class StudioDO extends DurableObject<StudioEnv> {
  private async readAll(): Promise<{
    projects: Record<string, Project>;
    jobs: Record<string, Job>;
    pages: Record<string, PageBrowse>;
  }> {
    return {
      projects: (await this.ctx.storage.get<Record<string, Project>>("projects")) ?? {},
      jobs: (await this.ctx.storage.get<Record<string, Job>>("jobs")) ?? {},
      pages: (await this.ctx.storage.get<Record<string, PageBrowse>>("pages")) ?? {},
    };
  }

  private async writeAll(
    projects: Record<string, Project>,
    jobs: Record<string, Job>,
    pages: Record<string, PageBrowse>,
  ): Promise<void> {
    await this.ctx.storage.put({ projects, jobs, pages });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.code);
      const message = error instanceof Error ? error.message : "The studio could not complete the request.";
      return json({ error: message }, 500);
    }
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/health" && request.method === "GET") {
      return json({
        status: "ok",
        agentAvailable: Boolean(this.env.FAL_KEY && this.env.OPENROUTER_API_KEY),
        agent: "Tardigrade",
        model: OPENROUTER_MODEL,
        skills: listCcSkills().map((skill) => skill.name),
        browser: this.env.BROWSER_USE_API_KEY ? "Browser Use" : "http",
        sdkVersion: "0.25.0",
        authentication: "none",
        trustLocalAgent: false,
      });
    }
    const { projects, jobs, pages } = await this.readAll();
    if (path === "/api/projects" && request.method === "GET") {
      return json({ projects: Object.values(projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
    }
    if (path === "/api/projects" && request.method === "POST") {
      const input = projectInput((await request.json()) as Record<string, unknown>);
      const id = crypto.randomUUID();
      const created = now();
      const project: Project = {
        ...input,
        id,
        status: "draft",
        createdAt: created,
        updatedAt: created,
        events: [{ id: crypto.randomUUID(), type: "created", message: "Draft saved.", createdAt: created }],
        artifacts: [],
      };
      projects[id] = project;
      await this.writeAll(projects, jobs, pages);
      return json({ project }, 201);
    }
    const match = path.match(/^\/api\/projects\/([0-9a-f-]{36})(?:\/(runs|cancel|artifacts)(?:\/([^/]+))?)?$/i);
    if (!match) return json({ error: "Not found." }, 404);
    const id = match[1]!;
    const project = projects[id];
    if (!project) return json({ error: "Project not found." }, 404);
    const operation = match[2];
    if (!operation && request.method === "GET") return json({ project });
    if (!operation && request.method === "PATCH") {
      const body = (await request.json()) as Record<string, unknown>;
      const next = await this.patch(project, body);
      projects[id] = next;
      await this.writeAll(projects, jobs, pages);
      return json({ project: next });
    }
    if (operation === "runs" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const revision = body.prompt === undefined ? undefined : stringField(body.prompt, "Revision prompt", 12000, 3);
      if (project.status === "queued" || project.status === "running") {
        throw new RequestError(409, "This project is already running.");
      }
      if (!this.env.FAL_KEY || !this.env.OPENROUTER_API_KEY) {
        throw new RequestError(503, "Tardigrade is not configured on this deployment.");
      }
      const prompt = revision ? `${project.prompt}\n\nRevision: ${revision}` : project.prompt;
      const next = event({ ...project, status: "queued", error: undefined }, "queued", "Queued on Tardigrade.");
      projects[id] = next;
      jobs[id] = {
        projectId: id,
        phase: project.referenceUrl ? "page" : "plan",
        prompt,
        aspectRatio: project.aspectRatio,
        duration: project.duration,
      };
      await this.writeAll(projects, jobs, pages);
      await this.ctx.storage.setAlarm(Date.now() + 250);
      return json({ project: next }, 202);
    }
    if (operation === "cancel" && request.method === "POST") {
      if (project.status !== "queued" && project.status !== "running") {
        throw new RequestError(409, "This project is not running.");
      }
      const taskId = jobs[id]?.browserTaskId;
      delete jobs[id];
      if (taskId && this.env.BROWSER_USE_API_KEY && !Object.values(jobs).some((item) => item.browserTaskId === taskId)) {
        void stopBrowserTask(this.env.BROWSER_USE_API_KEY, taskId);
      }
      const next = event({ ...project, status: "cancelled", error: "Cancelled." }, "cancelled", "Cancelled.");
      projects[id] = next;
      await this.writeAll(projects, jobs, pages);
      return json({ project: next });
    }
    if (operation === "artifacts" && match[3] && (request.method === "GET" || request.method === "HEAD")) {
      const artifact = project.artifacts.find((item) => item.id === match[3]);
      if (!artifact) return json({ error: "Artifact not found." }, 404);
      const object = await this.env.MEDIA.get(`projects/${id}/${artifact.id}`);
      if (!object) return json({ error: "Artifact not found." }, 404);
      const headers = new Headers({ "content-type": artifact.mimeType, "cache-control": "public, max-age=3600" });
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(object.body, { status: 200, headers });
    }
    return json({ error: "This action is not supported." }, 405);
  }

  private async patch(project: Project, body: Record<string, unknown>): Promise<Project> {
    const review = body.review === undefined ? undefined : readReview(body.review);
    const destinations = body.destinations === undefined ? undefined : readDestinations(body.destinations);
    if (review === undefined && destinations === undefined) {
      throw new RequestError(400, "Send a review decision or a social destination.");
    }
    const hasVideo = project.status === "completed" && project.artifacts.some((item) => item.mimeType.startsWith("video/"));
    if ((review === "approved" || review === "rejected" || review === "inbox") && !hasVideo) {
      throw new RequestError(409, "Only a finished video can enter review.");
    }
    if (review === "sent") {
      if (project.review !== "approved" && project.review !== "sent") {
        throw new RequestError(409, "Keep the video first, then send it.");
      }
      if ((destinations ?? project.destinations ?? []).length === 0) {
        throw new RequestError(400, "Choose at least one social destination.");
      }
    }
    const nextReview = review ?? project.review;
    const nextDestinations = destinations ?? project.destinations;
    return event(
      {
        ...project,
        ...(nextReview === undefined ? {} : { review: nextReview }),
        ...(nextDestinations === undefined ? {} : { destinations: nextDestinations }),
      },
      "review",
      review === "approved"
        ? "Kept for socials."
        : review === "rejected"
          ? "Skipped. It will not go to socials."
          : review === "sent"
            ? `Ready to post on ${(nextDestinations ?? []).join(", ")}.`
            : "Review updated.",
    );
  }

  async alarm(): Promise<void> {
    const key = this.env.FAL_KEY;
    if (!key || !this.env.OPENROUTER_API_KEY) return;
    const { projects, jobs, pages } = await this.readAll();
    let dirty = false;
    let slots = Object.values(projects).filter((project) => project.status === "running").length;
    for (const job of Object.values(jobs)) {
      const project = projects[job.projectId];
      if (!project || project.status === "cancelled") {
        delete jobs[job.projectId];
        dirty = true;
        continue;
      }
      if (project.status === "queued") {
        if (slots >= 2) continue;
        slots += 1;
      }
      try {
        const next = await this.step(key, project, job, pages);
        projects[job.projectId] = next.project;
        if (next.job) jobs[job.projectId] = next.job;
        else delete jobs[job.projectId];
        dirty = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tardigrade failed this take.";
        projects[job.projectId] = event({ ...project, status: "failed", error: message }, "failed", message);
        delete jobs[job.projectId];
        dirty = true;
        slots = Math.max(0, slots - 1);
      }
    }
    if (dirty) await this.writeAll(projects, jobs, pages);
    if (Object.keys(jobs).length > 0) await this.ctx.storage.setAlarm(Date.now() + 2500);
  }

  private async explore(
    project: Project,
    job: Job,
    pages: Record<string, PageBrowse>,
  ): Promise<{ project: Project; job?: Job }> {
    const url = project.referenceUrl!;
    const cacheKey = pageKey(url);
    const cached = pages[cacheKey];
    const browserKey = this.env.BROWSER_USE_API_KEY;
    const openrouter = this.env.OPENROUTER_API_KEY;
    if (cached?.brief && (cached.taskId || !browserKey)) {
      return {
        project: event({ ...project, status: "running" }, "page", cached.summary ?? "Opened the page."),
        job: { ...job, phase: "plan", pageNote: cached.brief, browserTaskId: cached.taskId },
      };
    }
    if (browserKey) {
      try {
        if (!cached?.taskId) {
          const taskId = await createBrowserTask(browserKey, url);
          pages[cacheKey] = { url, taskId };
          return {
            project: event({ ...project, status: "running" }, "page", `Browser Use opening ${new URL(url).hostname}.`),
            job: { ...job, browserTaskId: taskId },
          };
        }
        const task = await getBrowserTask(browserKey, cached.taskId);
        if (!isBrowserTerminal(task.status)) {
          return { project: { ...project, status: "running" }, job: { ...job, browserTaskId: cached.taskId } };
        }
        if (task.status === "finished" && task.output) {
          const explored = briefFromBrowser(task, url);
          pages[cacheKey] = { url, taskId: cached.taskId, brief: explored.brief, summary: explored.summary, hops: explored.hops };
          return {
            project: event({ ...project, status: "running" }, "page", explored.summary),
            job: { ...job, phase: "plan", pageNote: explored.brief, browserTaskId: cached.taskId },
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Browser Use failed.";
        project = event({ ...project, status: "running" }, "page", `Browser Use failed (${message.slice(0, 160)}). Using HTTP.`);
      }
    }
    if (!openrouter) throw new RequestError(503, "OpenRouter is not configured on this deployment.");
    const explored = await explorePage(openrouter, url);
    pages[cacheKey] = { url, brief: explored.brief, summary: explored.summary, hops: explored.hops };
    return {
      project: event({ ...project, status: "running" }, "page", explored.summary),
      job: { ...job, phase: "plan", pageNote: explored.brief },
    };
  }

  private async step(
    key: string,
    project: Project,
    job: Job,
    pages: Record<string, PageBrowse>,
  ): Promise<{ project: Project; job?: Job }> {
    if (job.phase === "page" && project.referenceUrl) {
      return this.explore(project, job, pages);
    }
    if (job.phase === "plan") {
      const openrouter = this.env.OPENROUTER_API_KEY;
      if (!openrouter) throw new RequestError(503, "OpenRouter is not configured on this deployment.");
      const plan = await planShots(openrouter, {
        prompt: job.prompt,
        format: project.format,
        style: project.style,
        aspectRatio: job.aspectRatio,
        duration: job.duration,
        pageNote: job.pageNote,
        referenceUrl: project.referenceUrl,
      });
      return {
        project: event(
          { ...project, status: "running" },
          "plan",
          `Opened ${plan.imageSkill} for the still, ${plan.videoSkill} for motion. Followed ${plan.pack.title}. Crafts: ${plan.pack.crafts.join(", ")}.`,
        ),
        job: {
          ...job,
          phase: "image",
          stillPrompt: plan.still,
          motionPrompt: plan.motion,
          captions: plan.captions,
          clips: plan.clips.map((clip) => ({
            duration: clip.duration,
            motionPrompt: clip.motion,
            captions: clip.captions,
          })),
          clipIndex: 0,
          imageSkill: plan.imageSkill,
          videoSkill: plan.videoSkill,
          videoModel: videoModelId(plan.videoSkill, true),
        },
      };
    }
    if (job.phase === "image" && !job.imageRequestId) {
      const submitted = await submit(key, IMAGE_MODEL, {
        prompt: stillPrompt(job, project),
        aspect_ratio: job.aspectRatio,
      });
      return {
        project: event(
          { ...project, status: "running" },
          "image",
          `Still on Tardigrade via ${job.imageSkill ?? "gpt-image-people"}.`,
        ),
        job: { ...job, phase: "image", imageRequestId: submitted.request_id },
      };
    }
    if (job.phase === "image" && job.imageRequestId) {
      const current = await status(key, IMAGE_MODEL, job.imageRequestId);
      if (!isTerminal(current.status)) return { project, job };
      if (current.status !== "COMPLETED") throw new FalError(`Still failed (${current.status}).`);
      const body = await result(key, IMAGE_MODEL, job.imageRequestId);
      const denied = refusal(body);
      if (denied) throw new FalError(denied);
      const imageUrl = mediaUrl(body);
      if (!imageUrl) throw new FalError("Tardigrade returned a still without a URL.");
      return {
        project: event(project, "image", "Still ready."),
        job: { ...job, phase: "video", imageUrl },
      };
    }
    if (job.phase === "video") {
      return this.stepVideo(key, project, job);
    }
    if (job.phase === "merge") {
      return this.stepMerge(key, project, job);
    }
    if (job.phase === "edit" && job.videoUrl && !job.editRequestId) {
      const cues = captionCues(jobCaptions(job), job.duration);
      if (cues.length === 0) return { project, job: { ...job, phase: "store" } };
      try {
        const submitted = await submit(key, CAPTION_EDIT_MODEL, captionEditInput(job.videoUrl, cues));
        return {
          project: event(project, "edit", "Hypit caption craft on the finished plate."),
          job: { ...job, editRequestId: submitted.request_id },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Caption edit failed.";
        return {
          project: event(project, "edit", `Caption edit skipped (${message.slice(0, 160)}). Plate stored without burned type.`),
          job: { ...job, phase: "store" },
        };
      }
    }
    if (job.phase === "edit" && job.editRequestId) {
      const current = await status(key, CAPTION_EDIT_MODEL, job.editRequestId);
      if (!isTerminal(current.status)) return { project, job };
      if (current.status !== "COMPLETED") {
        return {
          project: event(project, "edit", `Caption edit skipped (${current.status}). Plate stored without burned type.`),
          job: { ...job, phase: "store" },
        };
      }
      const body = await result(key, CAPTION_EDIT_MODEL, job.editRequestId);
      const denied = refusal(body);
      if (denied) {
        return {
          project: event(project, "edit", `Caption edit skipped (${denied.slice(0, 160)}). Plate stored without burned type.`),
          job: { ...job, phase: "store" },
        };
      }
      const edited = mediaUrl(body);
      if (!edited) {
        return {
          project: event(project, "edit", "Caption edit returned no film. Plate stored without burned type."),
          job: { ...job, phase: "store" },
        };
      }
      return {
        project: event(project, "edit", "Caption edit ready."),
        job: { ...job, phase: "store", videoUrl: edited },
      };
    }
    if (job.phase === "store") {
      const videoUrl = job.videoUrl;
      if (!videoUrl) throw new FalError("The finished film URL was lost.");
      const download = await fetch(videoUrl);
      if (!download.ok || !download.body) throw new FalError(`Could not copy the film (${download.status}).`);
      const artifactId = crypto.randomUUID();
      await this.env.MEDIA.put(`projects/${project.id}/${artifactId}`, download.body, {
        httpMetadata: { contentType: "video/mp4" },
      });
      const artifact: Artifact = {
        id: artifactId,
        name: "Finished video",
        url: `/api/projects/${project.id}/artifacts/${artifactId}`,
        mimeType: "video/mp4",
      };
      const stillId = job.imageUrl ? crypto.randomUUID() : undefined;
      const artifacts = [...project.artifacts, artifact];
      const cues = captionCues(jobCaptions(job), job.duration);
      if (cues.length > 0) {
        const captionId = crypto.randomUUID();
        await this.env.MEDIA.put(`projects/${project.id}/${captionId}`, cuesToVtt(cues), {
          httpMetadata: { contentType: "text/vtt" },
        });
        artifacts.push({
          id: captionId,
          name: "Hypit captions",
          url: `/api/projects/${project.id}/artifacts/${captionId}`,
          mimeType: "text/vtt",
        });
      }
      if (job.imageUrl && stillId) {
        const still = await fetch(job.imageUrl);
        if (still.ok && still.body) {
          await this.env.MEDIA.put(`projects/${project.id}/${stillId}`, still.body, {
            httpMetadata: { contentType: still.headers.get("content-type") ?? "image/png" },
          });
          artifacts.push({
            id: stillId,
            name: "Still",
            url: `/api/projects/${project.id}/artifacts/${stillId}`,
            mimeType: still.headers.get("content-type") ?? "image/png",
          });
        }
      }
      return {
        project: event(
          { ...project, status: "completed", artifacts, review: "inbox", error: undefined },
          "completed",
          "Film ready.",
        ),
      };
    }
    return { project, job };
  }

  private async stepVideo(key: string, project: Project, job: Job): Promise<{ project: Project; job?: Job }> {
    const clips =
      job.clips && job.clips.length > 0
        ? job.clips
        : [
            {
              duration: clipDurations(job.duration)[0] ?? 15,
              motionPrompt: motionPrompt(job, project),
              captions: job.captions,
            },
          ];
    const index = job.clipIndex ?? 0;
    const clip = clips[index];
    if (!clip) throw new FalError("Motion clip list was empty.");
    const renderModel = videoModelId(job.videoSkill, Boolean(job.imageUrl));
    if (!clip.requestId) {
      const submitted = await submit(
        key,
        renderModel,
        videoInput(renderModel, {
          prompt: clip.motionPrompt,
          imageUrl: job.imageUrl,
          aspectRatio: job.aspectRatio,
          duration: clip.duration,
        }),
      );
      const next = clips.map((item, itemIndex) => (itemIndex === index ? { ...item, requestId: submitted.request_id } : item));
      return {
        project: event(
          project,
          "video",
          clips.length > 1
            ? `Motion clip ${index + 1}/${clips.length} (${clip.duration}s) on Seedance 2 Fast. Natural pace.`
            : `Motion on Seedance 2 Fast (${renderModel}).`,
        ),
        job: { ...job, clips: next, clipIndex: index, videoRequestId: submitted.request_id, videoModel: renderModel },
      };
    }
    const pollModel = job.videoModel ?? renderModel;
    const current = await status(key, pollModel, clip.requestId);
    if (!isTerminal(current.status)) return { project, job: { ...job, clips } };
    if (current.status !== "COMPLETED") throw new FalError(`Motion clip ${index + 1} failed (${current.status}).`);
    const body = await result(key, pollModel, clip.requestId);
    const denied = refusal(body);
    if (denied) throw new FalError(denied);
    const videoUrl = mediaUrl(body);
    if (!videoUrl) throw new FalError("Tardigrade returned a film without a URL.");
    const next = clips.map((item, itemIndex) => (itemIndex === index ? { ...item, videoUrl } : item));
    if (index + 1 < next.length) {
      return {
        project: event(project, "video", `Clip ${index + 1}/${next.length} ready.`),
        job: { ...job, clips: next, clipIndex: index + 1, videoUrl: next[0]?.videoUrl },
      };
    }
    if (next.length === 1) {
      return {
        project: event(project, "video", "Motion ready."),
        job: { ...job, clips: next, videoUrl, phase: captionCues(jobCaptions({ ...job, clips: next }), job.duration).length > 0 ? "edit" : "store" },
      };
    }
    return {
      project: event(project, "video", `${next.length} clips ready. Joining at natural pace.`),
      job: { ...job, clips: next, videoUrl, phase: "merge" },
    };
  }

  private async stepMerge(key: string, project: Project, job: Job): Promise<{ project: Project; job?: Job }> {
    const urls = (job.clips ?? []).map((clip) => clip.videoUrl).filter((item): item is string => Boolean(item));
    if (urls.length < 2) {
      return {
        project,
        job: { ...job, phase: captionCues(jobCaptions(job), job.duration).length > 0 ? "edit" : "store", videoUrl: urls[0] ?? job.videoUrl },
      };
    }
    if (!job.mergeRequestId) {
      const submitted = await submit(key, MERGE_MODEL, mergeInput(urls));
      return {
        project: event(project, "video", `Joining ${urls.length} clips. No speed-up.`),
        job: { ...job, mergeRequestId: submitted.request_id },
      };
    }
    const current = await status(key, MERGE_MODEL, job.mergeRequestId);
    if (!isTerminal(current.status)) return { project, job };
    if (current.status !== "COMPLETED") throw new FalError(`Join failed (${current.status}).`);
    const body = await result(key, MERGE_MODEL, job.mergeRequestId);
    const denied = refusal(body);
    if (denied) throw new FalError(denied);
    const videoUrl = mediaUrl(body);
    if (!videoUrl) throw new FalError("Join returned no film.");
    return {
      project: event(project, "video", "Joined at natural pace."),
      job: { ...job, videoUrl, phase: captionCues(jobCaptions(job), job.duration).length > 0 ? "edit" : "store" },
    };
  }
}

function stillPrompt(job: Job, project: Project): string {
  if (job.stillPrompt) return job.stillPrompt;
  return [
    `Photoreal start frame for a ${job.aspectRatio} ${project.format ?? project.style} film.`,
    job.prompt,
    job.pageNote ? `Page facts: ${job.pageNote}` : "",
    "No text overlays. Natural light. Phone-camera UGC, not a render.",
  ]
    .filter(Boolean)
    .join("\n");
}

function motionPrompt(job: Job, project: Project): string {
  if (job.motionPrompt) return job.motionPrompt;
  return [
    `${job.duration}-second ${job.aspectRatio} ${project.format ?? project.style} film at natural pace (${clipDurations(job.duration).join(" + ")}s clips).`,
    job.prompt,
    job.pageNote ? `Page facts: ${job.pageNote}` : "",
    "Handheld phone, natural motion, spoken or implied product truth only from the brief. No invented claims.",
    "Do not rush or speed through the lines.",
    "Clean plate. No burned captions or on-screen type.",
  ]
    .filter(Boolean)
    .join("\n");
}

function jobCaptions(job: Job): string | undefined {
  const fromClips = job.clips
    ?.map((clip) => clip.captions)
    .filter((item): item is string => Boolean(item && item.trim()))
    .join("\n");
  return fromClips || job.captions;
}

function readReview(value: unknown): ReviewState {
  if (value !== "inbox" && value !== "approved" && value !== "rejected" && value !== "sent") {
    throw new RequestError(400, "Review must be inbox, approved, rejected, or sent.");
  }
  return value;
}

function readDestinations(value: unknown): SocialDestination[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > SOCIAL_DESTINATIONS.length) {
    throw new RequestError(400, "Choose one or more social destinations.");
  }
  return value.map((item) => {
    if (!SOCIAL_DESTINATIONS.includes(item as SocialDestination)) {
      throw new RequestError(400, "Choose TikTok, Instagram, YouTube, or X.");
    }
    return item as SocialDestination;
  });
}
