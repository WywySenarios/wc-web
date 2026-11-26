import type { APIRoute } from "astro";

import { createRun, messageOf, reconcile } from "@/lib/runs";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const GET: APIRoute = async () => {
  try {
    return json({ runs: await reconcile() });
  } catch (err) {
    return json({ error: messageOf(err) }, 500);
  }
};

export const POST: APIRoute = async () => {
  try {
    const result = await createRun();
    return json(result.body, result.status);
  } catch (err) {
    return json({ error: messageOf(err) }, 500);
  }
};
