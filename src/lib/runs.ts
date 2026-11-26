import {
  createJobFromCronJob,
  findPod,
  followLogs,
  jobStatus,
  waitForPod,
} from "@/lib/kube";
import { newRunId } from "@/lib/session";
import { isActive, isTerminal } from "@/lib/status";
import {
  appendEvent,
  listRuns,
  readEvents,
  readMeta,
  writeMeta,
} from "@/lib/store";
import {
  parseLine,
  type HarnessEvent,
  type RunMeta,
  type RunStatus,
} from "@/lib/types";

const active = new Map<string, Promise<void>>();

export interface CreateResult {
  status: number;
  body: { id?: string; error?: string };
}

export interface StreamHandlers {
  send: (event: HarnessEvent) => void;
  close: () => void;
  signal?: AbortSignal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function refresh(id: string): Promise<RunMeta | null> {
  const meta = await readMeta(id);
  if (!meta) return null;
  try {
    const status = await jobStatus(id);
    if (status !== meta.status) {
      meta.status = status;
      if (isTerminal(status)) meta.finishedAt = new Date().toISOString();
      await writeMeta(meta);
    }
  } catch (err) {
    // Keep the last known status, but make the failure visible.
    console.warn(`refresh ${id}:`, err);
  }
  return meta;
}

async function setStatus(id: string, status: RunStatus): Promise<void> {
  const meta = await readMeta(id);
  if (!meta) return;
  await writeMeta({
    ...meta,
    status,
    finishedAt: isTerminal(status) ? new Date().toISOString() : meta.finishedAt,
  });
}

export async function reconcile(): Promise<RunMeta[]> {
  const runs = await listRuns();
  const refreshed: RunMeta[] = [];
  for (const run of runs) refreshed.push((await refresh(run.id)) ?? run);
  return refreshed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createRun(): Promise<CreateResult> {
  const runs = await reconcile();
  if (runs.some((run) => isActive(run.status))) {
    return {
      status: 409,
      body: { error: "a run is already active; wait for it to finish" },
    };
  }

  const id = newRunId();
  await writeMeta({
    id,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
  try {
    await createJobFromCronJob(id);
  } catch (err) {
    const message = messageOf(err);
    await appendEvent(id, { type: "error", message });
    await setStatus(id, "failed");
    return { status: 502, body: { error: message } };
  }
  return { status: 202, body: { id } };
}

export async function streamRun(
  id: string,
  handlers: StreamHandlers,
): Promise<void> {
  const meta = await refresh(id);
  if (!meta) {
    handlers.send({ type: "error", message: "run not found" });
    handlers.close();
    return;
  }

  const persisted = await readEvents(id);
  for (const event of persisted) handlers.send(event);

  if (isTerminal(meta.status)) {
    await syncTerminal(id, persisted.length, handlers);
    await finishTerminal(id, meta.status, handlers);
    return;
  }

  if (active.has(id)) {
    await pollTranscript(id, persisted.length, handlers);
    return;
  }

  const current = await readEvents(id);
  if (current.length > persisted.length) {
    for (const event of current.slice(persisted.length)) handlers.send(event);
  }

  const job = follow(id, current.length, handlers);
  active.set(id, job);
  try {
    await job;
  } finally {
    active.delete(id);
  }
}

async function pollTranscript(
  id: string,
  start: number,
  handlers: StreamHandlers,
): Promise<void> {
  let seen = start;
  while (!handlers.signal?.aborted) {
    await sleep(500);
    const events = await readEvents(id);
    for (let index = seen; index < events.length; index++)
      handlers.send(events[index]);
    seen = events.length;

    const meta = await refresh(id);
    if (meta && isTerminal(meta.status)) {
      await finishTerminal(id, meta.status, handlers);
      return;
    }
  }
  handlers.close();
}

function lineWriter(
  id: string,
  skip: number,
  handlers: StreamHandlers,
): { onLine: (line: string) => void; flush: () => Promise<void> } {
  let remaining = skip;
  let pending: Promise<void> = Promise.resolve();
  return {
    onLine(line) {
      const event = parseLine(line);
      if (!event) return;
      if (remaining > 0) {
        remaining--;
        return;
      }
      pending = pending.then(() => appendEvent(id, event));
      handlers.send(event);
    },
    flush: () => pending,
  };
}

function follow(
  id: string,
  skip: number,
  handlers: StreamHandlers,
): Promise<void> {
  return (async () => {
    const pod = await waitForPod(id, 120_000);
    if (!pod) {
      const message = "run pod did not start within 120s";
      await appendEvent(id, { type: "error", message });
      await setStatus(id, "failed");
      handlers.send({ type: "error", message });
      await finishTerminal(id, "failed", handlers);
      return;
    }

    const writer = lineWriter(id, skip, handlers);
    const follower = followLogs(pod, writer.onLine);

    let followError: unknown = null;
    try {
      await follower.done;
    } catch (err) {
      followError = err;
    }
    await writer.flush();

    if (followError) {
      handlers.send({ type: "error", message: messageOf(followError) });
      const final = await waitForTerminal(id, 960_000);
      await syncTerminal(id, (await readEvents(id)).length, handlers);
      await finishTerminal(id, final?.status ?? "failed", handlers);
      return;
    }

    const final = await waitForTerminal(id, 60_000);
    await finishTerminal(id, final?.status ?? "failed", handlers);
  })();
}

async function waitForTerminal(
  id: string,
  timeoutMs: number,
): Promise<RunMeta | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const meta = await refresh(id);
    if (meta && isTerminal(meta.status)) return meta;
    await sleep(1000);
  }
  return readMeta(id);
}

async function finishTerminal(
  id: string,
  status: RunStatus,
  handlers: StreamHandlers,
): Promise<void> {
  const events = await readEvents(id);
  if (!events.some((event) => event.type === "session_end")) {
    const end: HarnessEvent = {
      type: "session_end",
      ok: status === "completed",
    };
    await appendEvent(id, end);
    handlers.send(end);
  }
  handlers.close();
}

/** Drain the pod's full log once, in case no follower survived to the end. */
async function syncTerminal(
  id: string,
  skip: number,
  handlers: StreamHandlers,
): Promise<void> {
  const pod = await findPod(id).catch((err) => {
    console.warn(`find pod for ${id}:`, err);
    return null;
  });
  if (!pod?.started) return;

  const writer = lineWriter(id, skip, handlers);
  const follower = followLogs(pod.name, writer.onLine);

  try {
    await follower.done;
  } catch (err) {
    // The pod may be gone; the persisted events are all we have.
    console.warn(`read log for ${id}:`, err);
  }
  await writer.flush();
}
