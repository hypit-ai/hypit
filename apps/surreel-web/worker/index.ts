import { StudioDO, type StudioEnv } from "./studio.ts";

export { StudioDO };

const studioStub = (env: StudioEnv) => env.STUDIO.get(env.STUDIO.idFromName("surreel"));

export default {
  async fetch(request: Request, env: StudioEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return studioStub(env).fetch(request);
    return new Response("Not found.", { status: 404 });
  },
};
