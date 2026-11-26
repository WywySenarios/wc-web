import type { APIRoute } from "astro";

import { messageOf, streamRun } from "@/lib/runs";
import { isValidRunId } from "@/lib/session";
import type { HarnessEvent } from "@/lib/types";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const id = params.id ?? "";
  if (!isValidRunId(id)) return new Response("invalid run id", { status: 400 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: HarnessEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      try {
        await streamRun(id, { send, close, signal: request.signal });
      } catch (err) {
        send({ type: "error", message: messageOf(err) });
        close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
};
